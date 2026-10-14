"""Offline regression of the local Frappe handlers with injected model doubles.

This does not import frappe, start a bench or access a database/site.
"""
import ast
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
APP = Path("/Users/arthurpimenta/Developer/lexia-frappe-app/lexia_crm/lexia_crm")


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.blocks = []
        self.advances = []
        self.inserted = []
        self.ticket = SimpleNamespace(name="synthetic-ticket", status="Resolvido", block=None, save=lambda **kwargs: None)

        class NativeDoc:
            def __init__(doc, fields):
                doc.fields = fields
                doc.name = "synthetic-ticket"

            def insert(doc, **kwargs):
                self.inserted.append(doc.fields)
                return doc

        def get_doc(*args):
            return NativeDoc(args[0]) if isinstance(args[0], dict) else self.ticket

        def block(event):
            self.blocks.append(event)
            return "Lexia Conversation Block", "synthetic-block"

        module = ast.parse((APP / "integration.py").read_text())
        wanted = {"_handle_handoff_requested", "_handle_handoff_resumed"}
        definitions = [n for n in module.body if isinstance(n, ast.FunctionDef) and n.name in wanted]
        self.ns = {
            "frappe": SimpleNamespace(db=SimpleNamespace(exists=lambda *args: False), get_doc=get_doc),
            "_conversation": lambda event: SimpleNamespace(name="synthetic-conversation"),
            "_aggregate_key": lambda *args: "synthetic-ticket",
            "_find_handoff_name": lambda *args: "synthetic-ticket",
            "_to_frappe_datetime": lambda value: value,
            "_handle_block_upsert": block,
            "_advance_conversation": lambda *args: self.advances.append(args),
            "_sync_operational_state": lambda *args: None,
            "_refresh_conversation_block_state": lambda *args: None,
            "_close_block": lambda *args: self.blocks.append(args),
        }
        exec(compile(ast.Module(body=definitions, type_ignores=[]), "integration.py", "exec"), self.ns)

    def request(self, priority):
        return {"scope": {"environment": "isolated_test"}, "payload": {
            "handoff_ref": "synthetic-handoff", "reason": "Synthetic reason", "summary": "Synthetic summary",
            "requested_at": "2026-10-12T12:00:00Z", "priority": priority}}

    def test_normal_and_low_do_not_create_block_or_move_conversation_to_handoff(self):
        for priority in ("low", "normal"):
            self.ns["_handle_handoff_requested"](self.request(priority))
        self.assertEqual(self.blocks, [])
        self.assertEqual(self.advances, [])
        self.assertTrue(all(doc["block"] is None for doc in self.inserted))

    def test_high_priority_creates_its_own_block_and_handoff_state(self):
        self.ns["_handle_handoff_requested"](self.request("high"))
        self.assertEqual(len(self.blocks), 1)
        self.assertEqual(len(self.advances), 1)
        self.assertEqual(self.inserted[0]["block"], "synthetic-block")

    def test_resume_normal_ticket_does_not_close_some_other_block(self):
        self.ns["_handle_handoff_resumed"]({"scope": {}, "payload": {
            "handoff_ref": "synthetic-handoff", "resumed_at": "2026-10-12T12:10:00Z"}})
        self.assertEqual(self.blocks, [])

    def test_normal_ticket_block_is_optional_in_native_doctype_definition(self):
        definition = json.loads((APP / "lexia_crm/doctype/lexia_handoff/lexia_handoff.json").read_text())
        field = next(f for f in definition["fields"] if f["fieldname"] == "block")
        self.assertFalse(field.get("reqd"))


class PipelineTests(unittest.TestCase):
    def module(self):
        spec = importlib.util.spec_from_file_location("pipeline", ROOT / "integrations/frappe/migration_pipeline.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_native_pipeline_requires_confirmed_message_and_post_send_reply(self):
        phase = self.module().phase_from_facts
        automation = [{"status": "Enviado", "action_ref": "synthetic-action", "attempted_at": "2026-10-12T12:00:00Z"}]
        messages = [{"author_type": "Lead", "provider_message_ref": "synthetic-lead", "occurred_at": "2026-10-12T12:01:00Z"}]
        self.assertEqual(phase(automation, messages, []), "Conversa ativa")
        messages.append({"author_type": "IA", "action_ref": "synthetic-action", "delivery_status": "Enviada", "provider_message_ref": "synthetic-ack"})
        self.assertEqual(phase(automation, messages, []), "Follow up recuperado")
        appointments = [{"tool_invocation_ref": "synthetic-create", "confirmed_at": "2026-10-12T12:02:00Z", "status": "Confirmado"}]
        self.assertEqual(phase(automation, messages, appointments), "Follow up convertido")
        messages.append({"author_type": "Lead", "provider_message_ref": "synthetic-late", "occurred_at": "2026-10-12T14:00:00Z"})
        self.assertEqual(phase(automation, messages, appointments), "Follow up convertido")

    def test_native_pipeline_never_uses_unknown_or_suppressed_delivery_as_recovery(self):
        phase = self.module().phase_from_facts
        for status in ("Resultado incerto", "Suprimido", "Aguardando"):
            self.assertEqual(phase([{"status": status, "action_ref": "synthetic-action", "attempted_at": "2026-10-12T12:00:00Z"}], [], []), "Novo lead")

    def test_reordered_confirmed_facts_recover_and_convert_without_model_stage(self):
        spec = importlib.util.spec_from_file_location("pipeline", ROOT / "integrations/frappe/migration_pipeline.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        scope = {"environment": "isolated_test", "cliente_slug": "empresa_sintetica_a", "channel": "whatsapp", "account_ref": "synthetic-account", "conversation_ref": "synthetic-conversation"}
        state = {"scope": scope, "conversation_ref": "synthetic-conversation", "cycle_ref": "synthetic-cycle", "event_ids": []}
        base = {"scope": scope, "conversation_ref": state["conversation_ref"], "cycle_ref": state["cycle_ref"]}
        for event in [
            {**base, "event_id": "booking", "type": "appointment_confirmed", "occurred_at": "2026-10-12T12:02:00Z", "operation": "appointment.create", "tool_status": "succeeded", "appointment_ref": "synthetic-appointment"},
            {**base, "event_id": "reply", "type": "lead_replied", "occurred_at": "2026-10-12T12:01:00Z", "author": "lead", "provider_message_id": "synthetic-reply"},
            {**base, "event_id": "sent", "type": "sent", "occurred_at": "2026-10-12T12:00:00Z", "action_id": "synthetic-action", "provider_message_id": "synthetic-send"},
        ]:
            state = module.reduce_cycle(state, event)
        self.assertEqual(state["status"], "converted")


class CommandDispatcherTests(unittest.TestCase):
    def run_dispatch(self, response=None, error=False, command_type="manual_pause.start"):
        acknowledgments = []
        users = []
        module = ast.parse((ROOT / "integrations/frappe/migration_commands.py").read_text())
        function = next(n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == "dispatch_command")

        def post(*args, **kwargs):
            if error:
                raise TimeoutError("synthetic timeout")
            return response

        namespace = {"frappe": SimpleNamespace(conf={"lexia_migration_commands_enabled": True,
            "lexia_migration_command_endpoint": "https://workflow.invalid/commands", "lexia_migration_command_token": "synthetic-token",
            "lexia_migration_integration_user": "synthetic-user"}, get_roles=lambda user: ["Lexia Integration"],
            session=SimpleNamespace(user="synthetic-operator"), set_user=users.append, db=SimpleNamespace(commit=lambda: None)),
            "make_post_request": post, "claim_command": lambda name: {"command": {"command_id": "synthetic-command", "command_type": command_type}},
            "acknowledge_command": lambda *args: acknowledgments.append(args)}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "migration_commands.py", "exec"), namespace)
        namespace["dispatch_command"]("synthetic-command")
        self.assertEqual(users[-1], "synthetic-operator")
        return acknowledgments[-1][1]

    def test_timeout_and_swapped_receipt_do_not_acknowledge_success(self):
        self.assertEqual(self.run_dispatch(error=True), "delivery_unknown")
        self.assertEqual(self.run_dispatch(response={"command_id": "other", "status": "applied"}), "delivery_unknown")

    def test_cancel_requires_confirmed_google_ledger_not_only_an_applied_status(self):
        receipt = {"command_id": "synthetic-command", "status": "applied"}
        self.assertEqual(self.run_dispatch(response=receipt, command_type="appointment.cancel"), "delivery_unknown")
        receipt["cancellation_status"] = "confirmed"
        self.assertEqual(self.run_dispatch(response=receipt, command_type="appointment.cancel"), "applied")


if __name__ == "__main__":
    unittest.main()
