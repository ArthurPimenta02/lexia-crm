import { timingSafeEqual } from "node:crypto";

export function isValidBearerAuthorization(
  authorization: string | null,
  expectedToken: string,
) {
  const parts = String(authorization ?? "").trim().split(/\s+/);
  const [scheme, token] = parts;

  if (
    !expectedToken ||
    parts.length !== 2 ||
    scheme?.toLowerCase() !== "bearer" ||
    !token
  ) {
    return false;
  }

  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expectedToken);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
