function replaceLiteralOnce(source, from, to) {
  if (source.split(from).length !== 2) throw Error('calendar_sql_source_anchor_mismatch');
  // Regex anchors in SQL contain "$'". A replacement string would expand
  // that sequence to the entire source suffix, corrupting/duplicating the SQL.
  return source.replace(from, () => to);
}

export function persistentCalendarSql(original) {
  let sql = original
    .replace('-- Requires an explicit disposable target and the existing Lot 2 baseline.',
      '-- Persistent migration review; retains the current isolated_test identity label. Requires Lot 2.')
    .replace('and disposable)', ')')
    .replaceAll('disposable_identity_required', 'explicit_identity_required');
  sql = replaceLiteralOnce(sql,
    "calendar_id text not null check(calendar_id ~ '^[A-Za-z0-9._-]+@group\\.calendar\\.google\\.com$')",
    "calendar_id text not null check(calendar_id ~ '^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$' and (operation='availability.check' or calendar_id ~ '^[A-Za-z0-9._-]+@group\\.calendar\\.google\\.com$'))");
  return replaceLiteralOnce(sql,
    "p_calendar !~ '^[A-Za-z0-9._-]+@group\\.calendar\\.google\\.com$'",
    "not (p_calendar ~ '^[A-Za-z0-9._-]+@group\\.calendar\\.google\\.com$' or (p_request->>'operation'='availability.check' and p_calendar ~ '^[A-Za-z0-9._+%-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'))");
}
