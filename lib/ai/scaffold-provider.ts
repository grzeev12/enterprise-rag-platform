import type { AiEmbeddingOptions, AiProvider, AiRequestOptions, ChatCompletionResult, ChatMessage, EmbeddingResult } from "@/lib/ai/types";
import { AiProviderError } from "@/lib/ai/types";

export class ScaffoldProvider implements AiProvider {
  constructor(
    public key: string,
    private displayName: string
  ) {}

  async chatCompletion(_messages: ChatMessage[], _options?: AiRequestOptions): Promise<ChatCompletionResult> {
    void _messages;
    void _options;
    throw this.notConfigured();
  }

  async *streamChatCompletion(_messages: ChatMessage[], _options?: AiRequestOptions) {
    void _messages;
    void _options;
    throw this.notConfigured();
  }

  async createEmbedding(_input: string, _options?: AiEmbeddingOptions): Promise<EmbeddingResult> {
    void _input;
    void _options;
    throw this.notConfigured();
  }

  async healthCheck() {
    return {
      ok: false,
      status: "UNAVAILABLE" as const,
      safeMessage: `${this.displayName} adapter is scaffolded and not configured yet.`
    };
  }

  private notConfigured() {
    return new AiProviderError(
      `${this.displayName} adapter is not implemented yet`,
      "PROVIDER_NOT_CONFIGURED",
      `${this.displayName} is not configured for this workspace.`
    );
  }
}
