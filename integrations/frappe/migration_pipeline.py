"""Local migration dependency. Copy into the Lexia Frappe app after review.

No hook/endpoint is enabled by creating this file. Uses native Frappe models.
The caller recomputes after a typed event, inside the ingestion transaction.
"""
from copy import deepcopy
from datetime import datetime
import json


def reduce_cycle(current, event):
    result = deepcopy(current)
    fields = ("environment", "cliente_slug", "channel", "account_ref", "conversation_ref")
    if any(not result.get("scope", {}).get(k) or event.get("scope", {}).get(k) != result["scope"][k] for k in fields):
        raise ValueError("followup_cycle_scope_mismatch")
    if (event["cycle_ref"], event["conversation_ref"]) != (
        result["cycle_ref"], result["conversation_ref"]
    ):
        raise ValueError("followup_cycle_origin_mismatch")
    result.setdefault("event_payloads", {})
    identity = json.dumps(event, sort_keys=True)
    if event["event_id"] in result["event_ids"]:
        if result["event_payloads"].get(event["event_id"]) != identity:
            raise ValueError("followup_event_retry_conflict")
        return result
    result.setdefault("reply_events", [])
    result.setdefault("appointment_events", [])
    kind = event["type"]
    if kind == "sent":
        if not event.get("action_id") or not event.get("provider_message_id"):
            raise ValueError("confirmed_delivery_required")
        if result.get("sent_at") and result["sent_at"] != event["occurred_at"]:
            raise ValueError("followup_delivery_conflict")
        result["sent_at"] = event["occurred_at"]
    elif kind == "lead_replied":
        if event.get("author") != "lead" or not event.get("provider_message_id"):
            raise ValueError("lead_reply_required")
        result["reply_events"].append({"at": event["occurred_at"], "message_id": event["provider_message_id"]})
    elif kind == "appointment_confirmed":
        if event.get("operation") != "appointment.create" or event.get("tool_status") != "succeeded" or not event.get("appointment_ref"):
            raise ValueError("confirmed_booking_required")
        result["appointment_events"].append({"at": event["occurred_at"], "appointment_ref": event["appointment_ref"]})
    else:
        raise ValueError("unsupported_cycle_event")
    time = lambda value: datetime.fromisoformat(value.replace("Z", "+00:00"))
    replies = sorted((r for r in result["reply_events"] if result.get("sent_at") and time(r["at"]) > time(result["sent_at"])), key=lambda r: time(r["at"]))
    reply = replies[0] if replies else None
    appointments = sorted((a for a in result["appointment_events"] if reply and time(a["at"]) >= time(reply["at"])), key=lambda a: time(a["at"]))
    appointment = appointments[0] if appointments else None
    result["lead_reply_at"] = reply["at"] if reply else None
    result["appointment_at"] = appointment["at"] if appointment else None
    result["appointment_ref"] = appointment["appointment_ref"] if appointment else None
    recovered, converted = bool(reply), bool(appointment)
    result["status"] = "converted" if converted else "recovered" if recovered else "sent" if result.get("sent_at") else "scheduled"
    result["event_ids"].append(event["event_id"])
    result["event_payloads"][event["event_id"]] = identity
    return result


def apply_native_pipeline(conversation, cycle):
    import frappe

    # Mapping is server-side and per site; the model cannot pick a CRM status.
    mapping = frappe.conf.get("lexia_migration_pipeline_statuses") or {}
    phase = {
        "sent": "Em follow up",
        "recovered": "Follow up recuperado",
        "converted": "Follow up convertido",
    }.get(cycle["status"])
    if not phase:
        return
    for doctype, name in (("CRM Lead", conversation.lead), ("CRM Deal", conversation.deal)):
        if not name:
            continue
        target = mapping.get(doctype, {}).get(phase)
        if not target or not frappe.db.exists(doctype + " Status", target):
            frappe.throw("Configure native pipeline statuses before enabling the migration.")
        doc = frappe.get_doc(doctype, name)
        doc.status = target
        doc.save(ignore_permissions=True)
    # The caller must authenticate, bind scope, claim an immutable event and
    # persist the cycle under row lock in the same transaction. No model output
    # or standalone webhook may call this helper as proof of a conversion.


def phase_from_facts(automations, messages, appointments):
    """Order facts by occurrence, including facts delivered to CRM late."""
    sent = sorted((a for a in automations if a.get("status") == "Enviado"
                   and a.get("action_ref") and a.get("attempted_at")), key=lambda a: a["attempted_at"])
    leads = [m for m in messages if m.get("author_type") == "Lead" and m.get("provider_message_ref")]
    confirmed = [a for a in appointments if a.get("tool_invocation_ref") and a.get("status") != "Cancelado"]
    if not sent:
        return "Agendado" if confirmed else "Conversa ativa" if leads else "Novo lead"
    # A follow-up needs its matching, confirmed message, not just a UI status.
    proven = [a for a in sent if any(m.get("action_ref") == a["action_ref"]
               and m.get("author_type") == "IA" and m.get("delivery_status") in {"Enviada", "Entregue", "Lida"}
               and m.get("provider_message_ref") for m in messages)]
    if not proven:
        return "Agendado" if confirmed else "Conversa ativa" if leads else "Novo lead"
    recovered = [m for m in leads if any(m["occurred_at"] > a["attempted_at"] for a in proven)]
    if any(a.get("confirmed_at") and any(a["confirmed_at"] >= m["occurred_at"] for m in recovered) for a in confirmed):
        return "Follow up convertido"
    if confirmed:
        return "Agendado"
    return "Follow up recuperado" if recovered else "Em follow up"


def recompute_native_pipeline(conversation):
    import frappe

    if not frappe.conf.get("lexia_migration_pipeline_enabled", False):
        return
    frappe.db.sql("SELECT name FROM `tabLexia Conversation` WHERE name=%s FOR UPDATE", (conversation.name,))
    automations = frappe.get_all("Lexia Automation Event", filters={"conversation": conversation.name, "event_type": "Follow-up"},
        fields=["status", "action_ref", "attempted_at"])
    messages = frappe.get_all("Lexia Message", filters={"conversation": conversation.name},
        fields=["author_type", "provider_message_ref", "action_ref", "delivery_status", "occurred_at"])
    appointments = frappe.get_all("Lexia Appointment", filters={"conversation": conversation.name},
        fields=["status", "tool_invocation_ref", "confirmed_at"])
    phase = phase_from_facts(automations, messages, appointments)
    mapping = frappe.conf.get("lexia_migration_pipeline_statuses") or {}
    for doctype, name in (("CRM Lead", conversation.lead), ("CRM Deal", conversation.deal)):
        if not name:
            continue
        target = mapping.get(doctype, {}).get(phase)
        if not target or not frappe.db.exists(doctype + " Status", target):
            frappe.throw("Configure the native pipeline mapping before enabling it.")
        doc = frappe.get_doc(doctype, name)
        if doc.status != target:
            doc.status = target
            doc.save(ignore_permissions=True)
