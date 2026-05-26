import { readEnv } from "@/lib/env";
import type { ProviderKey } from "@/lib/ai/gateway";

export const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21";

export function isAzureOpenAiConfigured() {
  return Boolean(
    readEnv("AZURE_OPENAI_API_KEY") &&
      readEnv("AZURE_OPENAI_ENDPOINT") &&
      readEnv("AZURE_OPENAI_DEPLOYMENT")
  );
}

export function isStandardOpenAiConfigured() {
  return Boolean(readEnv("OPENAI_API_KEY"));
}

export function isAiProviderConfigured() {
  return isAzureOpenAiConfigured() || isStandardOpenAiConfigured();
}

export function preferredProviderKey(): ProviderKey {
  return isAzureOpenAiConfigured() ? "azure-openai" : "openai";
}

export function azureOpenAiApiVersion() {
  return readEnv("AZURE_OPENAI_API_VERSION") ?? readEnv("OPENAI_API_VERSION") ?? DEFAULT_AZURE_OPENAI_API_VERSION;
}

export function azureOpenAiDeployment() {
  return readEnv("AZURE_OPENAI_DEPLOYMENT");
}
