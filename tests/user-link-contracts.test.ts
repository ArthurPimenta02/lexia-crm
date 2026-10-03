import assert from "node:assert/strict";
import test from "node:test";

import { getUserLinkRetryDecision } from "../lib/auth/user-link-contracts";

const desired = {
  cliente_slug: "cliente_a",
  role: "cliente_admin" as const,
  status: "ativo" as const,
};

test("a pending user link is created only when no association exists", () => {
  assert.equal(getUserLinkRetryDecision([], desired), "create");
});

test("an exact existing user link resolves idempotently", () => {
  assert.equal(getUserLinkRetryDecision([desired], desired), "already_linked");
});

test("any conflicting association preserves the pending review", () => {
  assert.equal(
    getUserLinkRetryDecision(
      [
        desired,
        {
          cliente_slug: "cliente_b",
          role: "cliente_operador",
          status: "ativo",
        },
      ],
      desired,
    ),
    "conflict",
  );
  assert.equal(
    getUserLinkRetryDecision(
      [
        {
          cliente_slug: "cliente_a",
          role: "cliente_admin",
          status: "inativo",
        },
      ],
      desired,
    ),
    "conflict",
  );
});
