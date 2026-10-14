// A non-secret denylist fingerprint only: collisions deny, never grant access.
// Do not use this for authentication, effect identity or idempotency.
export function referenceFingerprint(value) {
  let hash=2166136261;
  for(const character of String(value))hash=Math.imul(hash^character.charCodeAt(0),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
