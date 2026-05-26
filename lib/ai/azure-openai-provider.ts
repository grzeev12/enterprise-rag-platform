import { AzureOpenAI } from "openai";
import type { AiEmbeddingOptions, AiProvider, AiRequestOptions, ChatMessage, EmbeddingResult } from "@/lib/ai/types";
import { AiProviderError } from "@/lib/ai/types";
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/ai/embedding-config";
import { readEnv, readIntEnv, requireEnv } from "@/lib/env";
import { azureOpenAiApiVersion, azureOpenAiDeployment } from "@/lib/ai/provider-config";

export class AzureOpenAiProvider implements AiProvider {
  key = "azure-openai";
  private client: AzureOpenAI | null = null;

  constructor(
    private config: {
      apiKeyEnv?: string;
      endpoint?: string | null;
      deployment?: string | null;
      timeoutMs?: number;
      maxRetries?: number;
    } = {}
  ) {}

  private getDeployment() {
    return this.config.deployment ?? azureOpenAiDeployment() ?? requireEnv("AZURE_OPENAI_DEPLOYMENT", "Azure OpenAI provider");
  }

  private getClient() {
    if (this.client) return this.client;

    const apiKey = requireEnv(this.config.apiKeyEnv ?? "AZURE_OPENAI_API_KEY", "Azure OpenAI provider");
    const endpoint = this.config.endpoint ?? requireEnv("AZURE_OPENAI_ENDPOINT", "Azure OpenAI provider");

    this.client = new AzureOpenAI({
      apiKey,
      endpoint,
      deployment: this.getDeployment(),
      apiVersion: azureOpenAiApiVersion(),
      timeout: this.config.timeoutMs ?? readIntEnv("OPENAI_TIMEOUT_MS", 30000),
      maxRetries: this.config.maxRetries ?? readIntEnv("OPENAI_MAX_RETRIES", 2)
    });

    return this.client;
  }

  async chatCompletion(messages: ChatMessage[], options: AiRequestOptions = {}) {
    try {
      const model = options.model ?? this.getDeployment();
      const response = await this.getClient().chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxOutputTokens ?? 800
      });

      return {
        content: response.choices[0]?.message?.content ?? "",
        usage: normalizeUsage(response.usage)
      };
    } catch (error) {
      throw normalizeAzureOpenAiError(error);
    }
  }

  async *streamChatCompletion(messages: ChatMessage[], options: AiRequestOptions = {}) {
    try {
      const model = options.model ?? this.getDeployment();
      const stream = await this.getClient().chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxOutputTokens ?? 800,
        stream: true,
        stream_options: { include_usage: true }
      });

      for await (const part of stream) {
        const content = part.choices[0]?.delta?.content ?? "";
        const usage = normalizeUsage(part.usage);
        if (content || usage) {
          yield { content, usage };
        }
      }
    } catch (error) {
      throw normalizeAzureOpenAiError(error);
    }
  }

  async createEmbedding(input: string, options: AiEmbeddingOptions = {}): Promise<EmbeddingResult> {
    try {
      const model = options.model ?? readEnv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT") ?? this.getDeployment();
      const response = await this.getClient().embeddings.create({
        model,
        input
      });

      return {
        embedding: response.data[0]?.embedding ?? [],
        usage: normalizeUsage(response.usage),
        model: options.model ?? DEFAULT_EMBEDDING_MODEL
      };
    } catch (error) {
      throw normalizeAzureOpenAiError(error);
    }
  }

  async healthCheck() {
    const started = Date.now();
    try {
      await this.getClient().models.list();
      return { ok: true, status: "HEALTHY" as const, latencyMs: Date.now() - started };
    } catch (error) {
      const normalized = normalizeAzureOpenAiError(error);
      return {
        ok: false,
        status: normalized.code === "MISSING_AZURE_OPENAI_CONFIG" ? "UNAVAILABLE" as const : "DEGRADED" as const,
        latencyMs: Date.now() - started,
        safeMessage: normalized.safeMessage
      };
    }
  }
}

function normalizeUsage(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null) {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0
  };
}

function normalizeAzureOpenAiError(error: unknown) {
  if (error instanceof Error) {
    if (
      error.message.includes("AZURE_OPENAI_API_KEY") ||
      error.message.includes("AZURE_OPENAI_ENDPOINT") ||
      error.message.includes("AZURE_OPENAI_DEPLOYMENT")
    ) {
      return new AiProviderError(error.message, "MISSING_AZURE_OPENAI_CONFIG", "Azure OpenAI provider is not configured.");
    }
    return new AiProviderError(error.message, "AZURE_OPENAI_ERROR", "Azure OpenAI provider request failed.");
  }
  return new AiProviderError("Unknown Azure OpenAI error", "AZURE_OPENAI_ERROR", "Azure OpenAI provider request failed.");
}
