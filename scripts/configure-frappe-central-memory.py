"""Run only in the existing HML backend; preserve all unrelated configuration."""
import json
import os
from pathlib import Path
import sys

site = Path('/home/frappe/frappe-bench/sites/crm-hml.localhost')
config_file = site / 'site_config.json'
config = json.loads(config_file.read_text())
if config.get('lexia_environment') != 'isolated_test' or config.get('lexia_client_ref') not in {'empresa_sintetica_a', 'miranda_skin_experts'}:
    raise RuntimeError('hml_configuration_identity_mismatch')
account = '24000000-0000-4000-8000-000000000003'
enable = sys.argv[1:] == ['enable']
config.update({
    'lexia_client_ref': 'miranda_skin_experts',
    'lexia_allow_workflow_tests': enable,
    'lexia_workflow_test_mode': 'remote',
    'lexia_workflow_test_execution_mode': 'full_agent_virtual',
    'lexia_workflow_test_account_ref': account,
    'lexia_allowed_account_refs': [account],
    'lexia_workflow_test_calendar_access': 'disabled',
    'lexia_workflow_test_calendar_write_enabled': False,
    'lexia_migration_pipeline_enabled': False,
    'lexia_migration_commands_enabled': False,
})
targets = config.get('lexia_workflow_test_targets') or {}
if isinstance(targets, str):
    targets = json.loads(targets)
targets['omnichannel'] = 'https://n8n.srv1541887.hstgr.cloud/webhook/lexia-miranda-migration-agent-test'
config['lexia_workflow_test_targets'] = targets
hosts = config.get('lexia_workflow_test_allowed_hosts') or []
if isinstance(hosts, str):
    hosts = [x.strip() for x in hosts.split(',') if x.strip()]
config['lexia_workflow_test_allowed_hosts'] = sorted(set(hosts) | {'n8n.srv1541887.hstgr.cloud'})
if not config.get('lexia_workflow_test_bearer_token'):
    raise RuntimeError('existing_test_authentication_required')
temporary = config_file.with_suffix('.central-memory.tmp')
temporary.write_text(json.dumps(config, indent=2) + '\n')
temporary.chmod(0o600)
temporary.replace(config_file)
if enable:
    import frappe
    os.chdir(site.parent)
    frappe.init(site=site.name, sites_path='.')
    frappe.connect()
    try:
        user = 'lexia-operator-lab@synthetic.invalid'
        if not frappe.db.exists('User', user) or not frappe.db.exists('Role', 'Lexia Workflow Tester'):
            raise RuntimeError('existing_synthetic_tester_required')
        frappe.get_doc('User', user).add_roles('Lexia Workflow Tester')
        frappe.db.commit()
    finally:
        frappe.destroy()
print(json.dumps({'site': site.name, 'enabled': enable, 'calendar': 'disabled', 'other_targets_preserved': True}))
