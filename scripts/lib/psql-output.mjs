const transactionTags = new Set(["BEGIN", "COMMIT", "ROLLBACK"]);

export function parsePsqlDataLines(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !transactionTags.has(line));
}

export function parsePsqlSingleRow(output, label) {
  const lines = parsePsqlDataLines(output);
  if (lines.length !== 1) {
    throw new Error(`${label} must return exactly one data row.`);
  }
  return lines[0];
}

export function parsePsqlOptionalSingleRow(output, label) {
  const lines = parsePsqlDataLines(output);
  if (lines.length > 1) {
    throw new Error(`${label} returned more than one data row.`);
  }
  return lines[0] ?? "";
}

export function parsePsqlDelimitedRow(
  output,
  expectedColumns,
  label,
) {
  const values = parsePsqlSingleRow(output, label).split("|");
  if (values.length !== expectedColumns) {
    throw new Error(
      `${label} must return exactly ${expectedColumns} columns.`,
    );
  }
  return values;
}

export function parsePsqlBoolean(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${label} is not a canonical PostgreSQL boolean.`);
}

export function parsePsqlNonNegativeInteger(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} is not a non-negative integer.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} exceeds the safe integer range.`);
  }

  return parsed;
}
