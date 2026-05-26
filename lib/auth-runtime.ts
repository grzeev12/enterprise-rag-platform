import { readEnv } from "@/lib/env";

export function getAuthSecret() {
  return readEnv("AUTH_SECRET") ?? readEnv("NEXTAUTH_SECRET");
}

export function isAuthConfigured() {
  return Boolean(getAuthSecret());
}
