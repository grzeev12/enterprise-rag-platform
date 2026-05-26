import { OpenAiProvider } from "@/lib/ai/openai-provider";
import type { AiProvider } from "@/lib/ai/types";

export type ProviderKey = "openai" | "azure-openai" | "anthropic" | "gemini" | "mistral" | "cohere" | "groq";

export function getAiProvider(key: ProviderKey = "openai"): AiProvider {
  if (key === "openai") {
    return new OpenAiProvider();
  }
  throw new Error(`Provider ${key} is not implemented yet`);
}
