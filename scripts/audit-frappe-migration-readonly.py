"""HML-only schema/configuration inventory. Never returns tokens or customer rows."""
import hashlib
import json
import os
from pathlib import Path

import frappe

SITE = "crm-hml.localhost"
ROOT = Path("/home/frappe/frappe-bench")
os.chdir(ROOT)
config = json.loads((ROOT / "sites" / SITE / "site_config.json").read_text())
if config.get("lexia_environment") != "isolated_test":
    raise RuntimeError("refused_non_hml_frappe_site")

safe_keys = [
    "lexia_environment", "lexia_client_ref", "lexia_allow_workflow_tests",
    "lexia_workflow_test_mode", "lexia_workflow_test_execution_mode",
    "lexia_workflow_test_account_ref", "lexia_workflow_test_calendar_access",
    "lexia_workflow_test_calendar_write_enabled", "lexia_workflow_test_targets",
    "lexia_workflow_test_allowed_hosts", "lexia_migration_pipeline_enabled",
    "lexia_migration_commands_enabled",
]
files = {}
for name in ["integration.py", "commands.py", "workflow_tests.py", "workflow_test_chat.py",
             "migration_commands.py", "migration_pipeline.py", "__init__.py"]:
    path = ROOT / "apps/lexia_crm/lexia_crm" / name
    files[name] = {"exists": path.exists()}
    if path.exists():
        files[name]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        if name in {"integration.py", "commands.py", "workflow_tests.py"}:
            source = path.read_text()
            files[name]["migration_hook_present"] = "migration_" in source

os.chdir(ROOT / "sites")
frappe.init(site=SITE, sites_path=".")
frappe.connect()
try:
    frappe.db.sql("START TRANSACTION READ ONLY")
    types = ["Lexia Conversation", "Lexia Message", "Lexia Conversation Block", "Lexia Handoff",
             "Lexia Appointment", "Lexia Automation Event", "Lexia Workflow Test Run", "Lexia Integration Event"]
    doctypes = frappe.db.sql("SELECT name FROM tabDocType WHERE name IN %(types)s ORDER BY name", {"types": types}, as_dict=True)
    fields = frappe.db.sql("SELECT parent,fieldname,fieldtype,options,reqd FROM tabDocField WHERE parent IN %(types)s ORDER BY parent,idx", {"types": types}, as_dict=True)
    report = {
        "site": SITE, "scope": "HML read-only metadata, no conversations/messages/customer data",
        "configuration": {key: config.get(key) for key in safe_keys},
        "secret_presence_only": {key: bool(config.get(key)) for key in [
            "lexia_workflow_test_bearer_token", "lexia_migration_command_token"]},
        "files": files, "installed_doctypes": [row.name for row in doctypes], "fields": fields,
    }
    print(json.dumps(report, default=str))
finally:
    frappe.db.rollback()
    frappe.destroy()
