import { timingSafeEqual } from "node:crypto";

export function isWorkerTickAuthorized(authorizationHeader: string | null, expectedSecret: string | undefined) {
  if (!expectedSecret) return false;
  const token = parseBearerToken(authorizationHeader);
  if (!token) return false;

  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expectedSecret);
  if (tokenBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(tokenBuffer, expectedBuffer);
}

function parseBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

