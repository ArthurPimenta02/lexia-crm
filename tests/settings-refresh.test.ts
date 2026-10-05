import assert from "node:assert/strict";
import test from "node:test";

import { getSettingsRefreshTokenToApply } from "../lib/workflows/settings-refresh";

test("a successful settings edit refreshes once for its token", () => {
  const state = { refreshToken: "success-1", type: "success" } as const;

  assert.equal(getSettingsRefreshTokenToApply(state, null), "success-1");
  assert.equal(getSettingsRefreshTokenToApply(state, "success-1"), null);
});

test("consecutive successful settings edits have distinct refresh signals", () => {
  const first = { refreshToken: "success-1", type: "success" } as const;
  const second = { refreshToken: "success-2", type: "success" } as const;

  assert.equal(getSettingsRefreshTokenToApply(first, null), "success-1");
  assert.equal(
    getSettingsRefreshTokenToApply(second, "success-1"),
    "success-2",
  );
});

test("errors and empty refresh tokens never refresh settings", () => {
  assert.equal(
    getSettingsRefreshTokenToApply(
      { refreshToken: "previous-success", type: "error" },
      null,
    ),
    null,
  );
  assert.equal(
    getSettingsRefreshTokenToApply(
      { refreshToken: null, type: "success" },
      null,
    ),
    null,
  );
});
