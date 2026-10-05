const requiredLabels = [
  "service_role_key",
  "analyst_secret",
  "stored_workflow_v1",
  "stored_workflow_v2",
];

export function buildRuntimeResponseForbiddenValues({
  analystSecret,
  serviceRoleKey,
  workflowV1,
  workflowV2,
}) {
  return new Map([
    ["service_role_key", serviceRoleKey],
    ["analyst_secret", analystSecret],
    ["stored_workflow_v1", workflowV1],
    ["stored_workflow_v2", workflowV2],
  ]);
}

export function assertRuntimeResponseProtectionCoverage(forbiddenValues) {
  for (const label of requiredLabels) {
    const value = forbiddenValues.get(label);
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Runtime response protection is missing ${label}.`);
    }
  }
}

export function findRuntimeResponseLeaks(body, forbiddenValues) {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
  const leaks = [];

  for (const [label, value] of forbiddenValues) {
    if (value && text.includes(value)) leaks.push(label);
  }

  return leaks;
}

export function runtimeResponseContainsText(body, value) {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
  const expected = String(value);
  const normalizedText = text.replace(
    /\\+u([0-9a-fA-F]{4})/g,
    (_match, codeUnit) => String.fromCharCode(Number.parseInt(codeUnit, 16)),
  );

  return text.includes(expected) || normalizedText.includes(expected);
}

export function summarizeRuntimeActionResponse(body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const text = buffer.toString("utf8");
  const normalizedText = text.replace(
    /\\+u([0-9a-fA-F]{4})/g,
    (_match, codeUnit) => String.fromCharCode(Number.parseInt(codeUnit, 16)),
  );
  const lines = text.split(/\r?\n/).filter(Boolean);
  const chunkKinds = {};

  for (const line of lines) {
    const separator = line.indexOf(":");
    const payload = separator >= 0 ? line.slice(separator + 1).trimStart() : line;
    const kind = payload.at(0) || "empty";
    chunkKinds[kind] = (chunkKinds[kind] ?? 0) + 1;
  }

  return {
    byteLength: buffer.byteLength,
    chunkKinds,
    containsDigestKey: /["']digest["']\s*:/.test(normalizedText),
    containsErrorChunk: lines.some((line) => /^[^:]+:E/.test(line)),
    containsMessageKey: /["']message["']\s*:/.test(normalizedText),
    containsSuccessType: /["']type["']\s*:\s*["']success["']/.test(
      normalizedText,
    ),
    containsUndefinedToken: normalizedText.includes("$undefined"),
    lineCount: lines.length,
  };
}

export function extractRuntimeActionStateCandidates(body) {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
  const states = [];
  const seen = new Set();

  function inspect(value) {
    if (!value || typeof value !== "object") return;

    if (
      Object.hasOwn(value, "message") &&
      (typeof value.message === "string" || value.message === null) &&
      Object.hasOwn(value, "type") &&
      (typeof value.type === "string" || value.type === null)
    ) {
      const state = { message: value.message, type: value.type };
      const key = JSON.stringify(state);
      if (!seen.has(key)) {
        seen.add(key);
        states.push(state);
      }
    }

    for (const nested of Array.isArray(value) ? value : Object.values(value)) {
      inspect(nested);
    }
  }

  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;

    const payload = line.slice(separator + 1).trimStart();
    const candidates = [payload];
    if (/^[A-Z]/.test(payload) && ["{", "["].includes(payload.at(1))) {
      candidates.push(payload.slice(1));
    }

    for (const candidate of candidates) {
      if (!["{", "["].includes(candidate.at(0))) continue;
      try {
        inspect(JSON.parse(candidate));
      } catch {
        // Flight also has non-JSON chunk types; they are intentionally skipped.
      }
    }
  }

  return states;
}

export function classifyRuntimeActionMessage(message, knownMessages) {
  if (message === null) return { kind: "null", knownMessage: null };
  if (knownMessages.includes(message)) {
    return { kind: "exact", knownMessage: message };
  }

  const repairedLatin1 = Buffer.from(message, "latin1").toString("utf8");
  const repairedKnownMessage = knownMessages.find(
    (candidate) => candidate === repairedLatin1,
  );
  if (repairedKnownMessage) {
    return {
      kind: "utf8_bytes_interpreted_as_latin1",
      knownMessage: repairedKnownMessage,
    };
  }

  const canonicalize = (value) =>
    value
      .normalize("NFKD")
      .replace(/\p{Mark}/gu, "")
      .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
      .trim()
      .toLowerCase();
  const canonicalMessage = canonicalize(message);
  const canonicalKnownMessage = knownMessages.find(
    (candidate) => canonicalize(candidate) === canonicalMessage,
  );
  if (canonicalKnownMessage) {
    return { kind: "canonical_variant", knownMessage: canonicalKnownMessage };
  }

  return { kind: "unrecognized", knownMessage: null };
}
