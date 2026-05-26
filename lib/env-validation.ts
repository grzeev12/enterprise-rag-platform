import { readEnv } from "@/lib/env";
import { isObjectStorageConfigured } from "@/lib/storage/blob";

const appRequired = ["AUTH_SECRET", "AUTH_URL", "NEXT_PUBLIC_APP_URL"];
const workerRequired = ["DATABASE_URL", "REDIS_URL"];

export function validateEnvironment(target: "app" | "worker" | "all" = "app") {
  const required = target === "worker" ? workerRequired : target === "all" ? [...appRequired, ...workerRequired] : appRequired;
  const missing = required.filter((key) => !readEnv(key));
  if ((target === "worker" || target === "all") && !isObjectStorageConfigured()) {
    missing.push("OBJECT_STORAGE_PROVIDER configuration");
  }

  return {
    ok: missing.length === 0,
    missing
  };
}
