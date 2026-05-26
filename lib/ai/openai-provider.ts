import OpenAI from "openai";
import type { ChatMessage, AiProvider, AiRequestOptions, AiEmbeddingOptions, EmbeddingResult } from "@/lib/ai/types";
import { AiProviderError } from "@/lib/ai/types";
import { DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL } from "@/lib/ai/embedding-config";
import { readEnv, readIntEnv, requireEnv } from "@/lib/env";

export class OpenAiProvider implements AiProvider {
  key = "openai";
  private client: OpenAI | null = null;

  constructor(
    private config: {
      apiKeyEnv?: string;
      baseUrl?: string | null;
      timeoutMs?: number;
      maxRetries?: number;
    } = {}
  ) {}

  private getClient() {
    if (this.client) return this.client;

    const apiKey = requireEnv(this.config.apiKeyEnv ?? "OPENAI_API_KEY", "OpenAI provider");
    this.client = new OpenAI({
      apiKey,
      baseURL: this.config.baseUrl ?? readEnv("OPENAI_BASE_URL"),
      timeout: this.config.timeoutMs ?? readIntEnv("OPENAI_TIMEOUT_MS", 30000),
      maxRetries: this.config.maxRetries ?? readIntEnv("OPENAI_MAX_RETRIES", 2)
    });

    return this.client;
  }

  async chatCompletion(messages: ChatMessage[], options: AiRequestOptions = {}) {
    try {
      const response = await this.getClient().chat.completions.create({
        model: options.model ?? defaultChatModel(),
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxOutputTokens ?? 800
      });

      return {
        content: response.choices[0]?.message?.content ?? "",
        usage: normalizeUsage(response.usage)
      };
    } catch (error) {
      throw normalizeOpenAiError(error);
    }
  }

  async *streamChatCompletion(messages: ChatMessage[], options: AiRequestOptions = {}) {
    try {
      const stream = await this.getClient().chat.completions.create({
        model: options.model ?? defaultChatModel(),
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
      throw normalizeOpenAiError(error);
    }
  }

  async createEmbedding(input: string, options: AiEmbeddingOptions = {}): Promise<EmbeddingResult> {
    try {
      const model = options.model ?? defaultEmbeddingModel();
      const response = await this.getClient().embeddings.create({
        model,
        input
      });

      return {
        embedding: response.data[0]?.embedding ?? [],
        usage: normalizeUsage(response.usage),
        model
      };
    } catch (error) {
      throw normalizeOpenAiError(error);
    }
  }

  async healthCheck() {
    const started = Date.now();
    try {
      await this.getClient().models.list();
      return { ok: true, status: "HEALTHY" as const, latencyMs: Date.now() - started };
    } catch (error) {
      const normalized = normalizeOpenAiError(error);
      return {
        ok: false,
        status: normalized.code === "MISSING_OPENAI_API_KEY" ? "UNAVAILABLE" as const : "DEGRADED" as const,
        latencyMs: Date.now() - started,
        safeMessage: normalized.safeMessage
      };
    }
  }
}

export function defaultChatModel() {
  return readEnv("OPENAI_CHAT_MODEL") ?? "gpt-4o-mini";
}

export function defaultEmbeddingModel() {
  return readEnv("OPENAI_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
}

export function defaultEmbeddingDimensions() {
  return readIntEnv("OPENAI_EMBEDDING_DIMENSIONS", DEFAULT_EMBEDDING_DIMENSIONS);
}

function normalizeUsage(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null) {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0
  };
}

function normalizeOpenAiError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("OPENAI_API_KEY")) {
      return new AiProviderError(error.message, "MISSING_OPENAI_API_KEY", "AI provider is not configured.");
    }
    return new AiProviderError(error.message, "OPENAI_ERROR", "AI provider request failed.");
  }
  return new AiProviderError("Unknown OpenAI error", "OPENAI_ERROR", "AI provider request failed.");
}
