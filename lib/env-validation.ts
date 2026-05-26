import { readEnv } from "@/lib/env";
import { isObjectStorageConfigured } from "@/lib/storage/blob";

const appRequired = ["NEXT_PUBLIC_APP_URL"];
const appRequiredAlternatives = [
  { label: "AUTH_SECRET or NEXTAUTH_SECRET", keys: ["AUTH_SECRET", "NEXTAUTH_SECRET"] },
  { label: "AUTH_URL or NEXTAUTH_URL", keys: ["AUTH_URL", "NEXTAUTH_URL"] }
];
const workerRequired = ["DATABASE_URL", "REDIS_URL"];

export function validateEnvironment(target: "app" | "worker" | "all" = "app") {
  const required = target === "worker" ? workerRequired : target === "all" ? [...appRequired, ...workerRequired] : appRequired;
  const missing = required.filter((key) => !readEnv(key));
  if (target === "app" || target === "all") {
    for (const alternative of appRequiredAlternatives) {
      if (!alternative.keys.some((key) => readEnv(key))) {
        missing.push(alternative.label);
      }
    }
  }

  if ((target === "worker" || target === "all") && !isObjectStorageConfigured()) {
    missing.push("OBJECT_STORAGE_PROVIDER configuration");
  }

  return {
    ok: missing.length === 0,
    missing
  };
}
