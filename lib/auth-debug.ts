import { readEnv } from "@/lib/env";

export function isAuthDebugEnabled() {
  return readEnv("ENABLE_AUTH_DEBUG") === "true";
}

export function authDebugNotFound() {
  return Response.json({ error: "Not found" }, { status: 404 });
}
