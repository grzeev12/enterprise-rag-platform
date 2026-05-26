import { readEnv } from "@/lib/env";

const appRequired = ["AUTH_SECRET", "AUTH_URL", "NEXT_PUBLIC_APP_URL"];
const workerRequired = ["DATABASE_URL", "REDIS_URL", "AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_CONTAINER_NAME"];

export function validateEnvironment(target: "app" | "worker" | "all" = "app") {
  const required = target === "worker" ? workerRequired : target === "all" ? [...appRequired, ...workerRequired] : appRequired;
  const missing = required.filter((key) => !readEnv(key));
  return {
    ok: missing.length === 0,
    missing
  };
}
