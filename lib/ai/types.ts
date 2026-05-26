import type { AiRequestType } from "@prisma/client";

export type AiUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionResult = {
  content: string;
  usage?: AiUsage;
};

export type StreamDelta = {
  content: string;
  usage?: AiUsage;
};

export type EmbeddingResult = {
  embedding: number[];
  usage?: AiUsage;
  model: string;
};

export interface AiProvider {
  key: string;
  chatCompletion(messages: ChatMessage[], options?: AiRequestOptions): Promise<ChatCompletionResult>;
  streamChatCompletion(messages: ChatMessage[], options?: AiRequestOptions): AsyncIterable<StreamDelta>;
  createEmbedding(input: string, options?: AiEmbeddingOptions): Promise<EmbeddingResult>;
  healthCheck?(): Promise<ProviderHealth>;
}

export type AiRequestOptions = {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  type?: AiRequestType;
};

export type AiEmbeddingOptions = {
  model?: string;
  timeoutMs?: number;
};

export class AiProviderError extends Error {
  constructor(
    message: string,
    public code = "AI_PROVIDER_ERROR",
    public safeMessage = "The AI provider request failed."
  ) {
    super(message);
  }
}

export type ProviderHealth = {
  ok: boolean;
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  latencyMs?: number;
  safeMessage?: string;
};
