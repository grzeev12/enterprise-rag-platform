import { validateEnvironment } from "@/lib/env-validation";
import { readEnv } from "@/lib/env";

export async function GET() {
  const env = validateEnvironment("app");
  const dependencies = {
    databaseConfigured: Boolean(readEnv("DATABASE_URL")),
    redisConfigured: Boolean(readEnv("REDIS_URL")),
    blobConfigured: Boolean(readEnv("AZURE_STORAGE_CONNECTION_STRING")),
    aiConfigured: Boolean(readEnv("OPENAI_API_KEY"))
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
