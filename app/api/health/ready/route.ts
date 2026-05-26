import { validateEnvironment } from "@/lib/env-validation";
import { readEnv } from "@/lib/env";
import { isAiProviderConfigured } from "@/lib/ai/provider-config";
import { isObjectStorageConfigured } from "@/lib/storage/blob";

export async function GET() {
  const env = validateEnvironment("app");
  const dependencies = {
    databaseConfigured: Boolean(readEnv("DATABASE_URL")),
    redisConfigured: Boolean(readEnv("REDIS_URL")),
    objectStorageConfigured: isObjectStorageConfigured(),
    aiConfigured: isAiProviderConfigured()
  };
  const ok = env.ok;

  return Response.json(
    {
      ok,
      env,
      dependencies,
      at: new Date().toISOString()
    },
    { status: ok ? 200 : 503 }
  );
}
