import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { persistentCalendarSql } from '../scripts/lib/miranda-migration-sql.mjs';

const original = readFileSync('supabase/isolated/lote2/202610120001_calendar_tools.sql', 'utf8');
const generated = persistentCalendarSql(original);
test('calendar SQL replacement preserves dollar anchors without injecting suffix copies', () => {
  assert.equal((generated.match(/^begin;/gm) || []).length, 1);
  assert.equal((generated.match(/^commit;/gm) || []).length, 1);
  assert.equal((generated.match(/^create table public.lexia_calendar_tool_calls/gm) || []).length, 1);
  assert.equal((generated.match(/^create function public.lexia_calendar_test_/gm) || []).length, 4);
  assert.match(generated, /calendar\\\.google\\\.com\$'\)\)/);
  assert.match(generated, /\[A-Za-z\]\{2,\}\$'/);
  assert.ok(generated.length < original.length + 1000);
});
test('persistent SQL retires only disposable flag, not target identity, uncertainty or permissions', () => {
  assert.doesNotMatch(generated, /and disposable|disposable_identity_required/);
  for (const text of ["current_setting('lexia.target_project_ref', true)", "environment='isolated_test'", 'calendar_original_production_destination_forbidden',
    "status in ('claimed','unknown')", 'calendar_claim_owner_mismatch', 'from public,anon,authenticated', "operation='availability.check'"]) {
    assert.ok(generated.includes(text), text);
  }
});
test('review artifact matches fixed generation and unknown source variants fail closed', () => {
  assert.equal(readFileSync('supabase/review/miranda-migration/202610120001_calendar_tools_persistent.sql', 'utf8'), generated);
  assert.throws(() => persistentCalendarSql(original + original), /source_anchor_mismatch/);
  assert.throws(() => persistentCalendarSql(''), /source_anchor_mismatch/);
});
