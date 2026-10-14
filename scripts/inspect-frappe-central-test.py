"""Read only one explicitly synthetic run; emit safe trace/status metadata."""
import json
import os
import sys
from uuid import UUID
import frappe

run_id = str(UUID(sys.argv[1]))
os.chdir('/home/frappe/frappe-bench/sites')
frappe.init(site='crm-hml.localhost', sites_path='.')
frappe.connect()
try:
    if frappe.conf.get('lexia_environment') != 'isolated_test':
        raise RuntimeError('hml_only')
    frappe.db.sql('START TRANSACTION READ ONLY')
    doc = frappe.get_doc('Lexia Workflow Test Run', run_id)
    if not doc.synthetic or doc.client_ref != 'miranda_skin_experts':
        raise RuntimeError('synthetic_miranda_run_required')
    result = json.loads(doc.result_payload or '{}')
    output = result.get('output', {})
    print(json.dumps({'status': doc.status, 'reason': output.get('reason'),
        'delivery_results': output.get('delivery_results'), 'trace': result.get('trace'),
        'provider_send_attempted': result.get('provider_send_attempted')}))
finally:
    frappe.db.rollback()
    frappe.destroy()
