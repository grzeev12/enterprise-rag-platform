import OpenAI from "openai";
import type { ChatMessage, AiProvider, AiRequestOptions, AiEmbeddingOptions, EmbeddingResult } from "@/lib/ai/types";
import { AiProviderError } from "@/lib/ai/types";

export class OpenAiProvider implements AiProvider {
  key = "openai";
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AiProviderError("OPENAI_API_KEY is not configured", "MISSING_OPENAI_API_KEY", "AI provider is not configured.");
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 30000),
      maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? 2)
    });
  }

  async chatCompletion(messages: ChatMessage[], options: AiRequestOptions = {}) {
    try {
      const response = await this.client.chat.completions.create({
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
      const stream = await this.client.chat.completions.create({
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
      const response = await this.client.embeddings.create({
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
}

export function defaultChatModel() {
  return process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
}

export function defaultEmbeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
}

export function defaultEmbeddingDimensions() {
  return Number(process.env.OPENAI_EMBEDDING_DIMENSIONS ?? 1536);
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
    return new AiProviderError(error.message, "OPENAI_ERROR", "AI provider request failed.");
  }
  return new AiProviderError("Unknown OpenAI error", "OPENAI_ERROR", "AI provider request failed.");
}
