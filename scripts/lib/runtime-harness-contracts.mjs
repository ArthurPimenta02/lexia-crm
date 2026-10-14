export const temporaryNpmInstallArgs = Object.freeze([
  "ci",
  "--include=dev",
]);

const manifestClientTables = Object.freeze([
  ["lexia_clientes", "slug"],
  ["lexia_workflows", "cliente_slug"],
  ["lexia_testes_sessoes", "cliente_slug"],
  ["lexia_testes_execucoes", "cliente_slug"],
  ["lexia_feedbacks", "cliente_slug"],
  ["lexia_handoffs", "cliente_slug"],
  ["lexia_contactos", "cliente_slug"],
  ["lexia_mensagens", "cliente_slug"],
  ["lexia_ai_sessoes", "cliente_slug"],
  ["lexia_ai_mensagens", "cliente_slug"],
  ["lexia_ai_execucoes", "cliente_slug"],
  ["lexia_conversation_insights", "cliente_slug"],
  ["lexia_user_link_pendencias", "cliente_slug"],
]);

export function assertTemporaryInstallIncludesDevDependencies(args) {
  if (args[0] !== "ci" || !args.includes("--include=dev")) {
    throw new Error(
      "Temporary npm install must use npm ci --include=dev for the Next build.",
    );
  }
}

export function assertRuntimeHarnessMode({ harnessExists, verifyOnly }) {
  if (verifyOnly && !harnessExists) {
    throw new Error(
      "Verification-only mode refused: the runtime harness is not installed.",
    );
  }
}

export function buildRuntimeManifestCleanupChecks(clientSlugs) {
  const values = [...clientSlugs];

  return manifestClientTables.map(([table, column]) => ({
    column,
    table,
    values: [...values],
  }));
}

export function assertRuntimeManifestCleanupContract(checks) {
  const expected = new Map(manifestClientTables);

  if (checks.length !== expected.size) {
    throw new Error("Runtime manifest cleanup table coverage is incomplete.");
  }

  for (const check of checks) {
    if (expected.get(check.table) !== check.column) {
      throw new Error(
        `Runtime manifest cleanup uses an invalid key for ${check.table}.`,
      );
    }
    if (!Array.isArray(check.values)) {
      throw new Error(
        `Runtime manifest cleanup is missing scoped values for ${check.table}.`,
      );
    }
  }
}
