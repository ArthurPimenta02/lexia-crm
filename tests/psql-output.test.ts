import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePsqlBoolean,
  parsePsqlDataLines,
  parsePsqlDelimitedRow,
  parsePsqlNonNegativeInteger,
  parsePsqlOptionalSingleRow,
  parsePsqlSingleRow,
} from "../scripts/lib/psql-output.mjs";

test("PostgreSQL boolean parser accepts only canonical true and false", () => {
  assert.equal(parsePsqlBoolean("true", "marker"), true);
  assert.equal(parsePsqlBoolean("false", "marker"), false);
  assert.throws(() => parsePsqlBoolean("", "marker"), /not a canonical/);
  assert.throws(
    () => parsePsqlBoolean("unexpected", "marker"),
    /not a canonical/,
  );
});

test("PostgreSQL output parsing fails closed on missing or ambiguous rows", () => {
  assert.deepEqual(parsePsqlDataLines("BEGIN\nvalue\nCOMMIT\n"), ["value"]);
  assert.equal(parsePsqlSingleRow("BEGIN\nvalue\nCOMMIT", "single"), "value");
  assert.equal(parsePsqlOptionalSingleRow("BEGIN\nCOMMIT", "optional"), "");
  assert.deepEqual(
    parsePsqlDelimitedRow("BEGIN\na|b|true\nCOMMIT", 3, "identity"),
    ["a", "b", "true"],
  );
  assert.throws(() => parsePsqlSingleRow("", "single"), /exactly one/);
  assert.throws(
    () => parsePsqlSingleRow("one\ntwo", "single"),
    /exactly one/,
  );
  assert.throws(
    () => parsePsqlDelimitedRow("a|b", 3, "identity"),
    /exactly 3 columns/,
  );
});

test("PostgreSQL count parser rejects empty and malformed values", () => {
  assert.equal(parsePsqlNonNegativeInteger("0", "count"), 0);
  assert.equal(parsePsqlNonNegativeInteger("42", "count"), 42);
  assert.throws(() => parsePsqlNonNegativeInteger("", "count"), /not a/);
  assert.throws(() => parsePsqlNonNegativeInteger("1x", "count"), /not a/);
  assert.throws(() => parsePsqlNonNegativeInteger("-1", "count"), /not a/);
});
