import { AzureOpenAiProvider } from "@/lib/ai/azure-openai-provider";
import { OpenAiProvider } from "@/lib/ai/openai-provider";
import type { AiProvider } from "@/lib/ai/types";
import { ScaffoldProvider } from "@/lib/ai/scaffold-provider";

export type ProviderKey = "openai" | "azure-openai" | "anthropic" | "gemini" | "mistral" | "cohere" | "groq";

export const providerCatalog: Record<ProviderKey, { name: string; envVar: string }> = {
  openai: { name: "OpenAI", envVar: "OPENAI_API_KEY" },
  "azure-openai": { name: "Azure OpenAI", envVar: "AZURE_OPENAI_API_KEY" },
  anthropic: { name: "Anthropic", envVar: "ANTHROPIC_API_KEY" },
  gemini: { name: "Gemini", envVar: "GEMINI_API_KEY" },
  mistral: { name: "Mistral", envVar: "MISTRAL_API_KEY" },
  cohere: { name: "Cohere", envVar: "COHERE_API_KEY" },
  groq: { name: "Groq", envVar: "GROQ_API_KEY" }
};

export function getAiProvider(
  key: ProviderKey = "openai",
  config: { baseUrl?: string | null; timeoutMs?: number; maxRetries?: number; apiKeySecretRef?: string | null } = {}
): AiProvider {
  if (key === "openai") {
    return new OpenAiProvider({
      apiKeyEnv: config.apiKeySecretRef ?? providerCatalog.openai.envVar,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries
    });
  }
  if (key === "azure-openai") {
    return new AzureOpenAiProvider({
      apiKeyEnv: config.apiKeySecretRef ?? providerCatalog["azure-openai"].envVar,
      endpoint: config.baseUrl,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries
    });
  }
  return new ScaffoldProvider(key, providerCatalog[key].name);
}

export function isProviderKey(key: string): key is ProviderKey {
  return key in providerCatalog;
}

export function maskSecretRef(secretRef?: string | null) {
  if (!secretRef) return "Not configured";
  if (secretRef.length <= 6) return "***";
  return `${secretRef.slice(0, 3)}***${secretRef.slice(-3)}`;
}
