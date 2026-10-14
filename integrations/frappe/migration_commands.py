"""Server-side command dispatcher. Install in the Lexia app after review.

Disabled unless explicitly configured. No requests run during file generation.
The token belongs in site_config, never in the browser or workflow JSON.
"""
import frappe
from frappe.integrations.utils import make_post_request

from lexia_crm.commands import claim_command, acknowledge_command


def dispatch_command(command_name):
    if not frappe.conf.get("lexia_migration_commands_enabled", False):
        return
    endpoint = frappe.conf.get("lexia_migration_command_endpoint")
    token = frappe.conf.get("lexia_migration_command_token")
    user = frappe.conf.get("lexia_migration_integration_user")
    if not endpoint or not endpoint.startswith("https://") or not token or not user:
        frappe.throw("Configure the migration command transport on the server.")
    if "Lexia Integration" not in frappe.get_roles(user) and "System Manager" not in frappe.get_roles(user):
        frappe.throw("The configured command transport user lacks integration permission.")
    original_user = frappe.session.user
    try:
        frappe.set_user(user)
        claimed = claim_command(command_name)
        # Claim is durable before HTTP; a crash is visible as Dispatched, not
        # permission to issue an unrelated command or retry a Google delete.
        frappe.db.commit()
        command = claimed["command"]
        try:
            receipt = make_post_request(endpoint, json=command,
                headers={"Authorization": "Bearer " + token}, timeout=30)
        except Exception:
            return acknowledge_command(command_name, "delivery_unknown", "command_transport_uncertain")
        if not isinstance(receipt, dict) or receipt.get("command_id") != command["command_id"]:
            return acknowledge_command(command_name, "delivery_unknown", "command_receipt_mismatch")
        status = receipt.get("status")
        if status not in {"applied", "duplicate", "rejected", "delivery_unknown"}:
            status = "delivery_unknown"
        if command["command_type"] == "appointment.cancel" and receipt.get("cancellation_status") != "confirmed":
            status = "delivery_unknown"
        return acknowledge_command(command_name, status, "central_command_receipt")
    finally:
        frappe.set_user(original_user)
