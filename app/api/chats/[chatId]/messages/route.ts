import { z } from "zod";
import { resolveModelRoute, streamChatWithFallback } from "@/lib/ai/router";
import { recordTokenUsage } from "@/lib/ai/usage";
import { requireWorkspaceAccess } from "@/lib/authz";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { readIntEnv } from "@/lib/env";
import { logError, logInfo } from "@/lib/observability/logger";
import { buildRagMessages } from "@/lib/rag/prompt";
import { retrieveWorkspaceContext } from "@/lib/rag/retrieval";

type Params = {
  params: Promise<{ chatId: string }>;
};

const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(8000)
});

export async function POST(request: Request, { params }: Params) {
  const encoder = new TextEncoder();

  try {
    const user = await requireCurrentUser();
    const { chatId } = await params;
    const input = sendMessageSchema.parse(await request.json());
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId: user.id, status: "ACTIVE" }
    });

    if (!chat) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    await requireWorkspaceAccess(user.id, chat.organizationId, chat.workspaceId, "chat:create");

    const userMessage = await prisma.message.create({
      data: {
        organizationId: chat.organizationId,
        workspaceId: chat.workspaceId,
        chatId: chat.id,
        userId: user.id,
        role: "USER",
        content: input.content
      }
    });

    const route = await resolveModelRoute({
      organizationId: chat.organizationId,
      workspaceId: chat.workspaceId,
      kind: "chat"
    });

    const aiRequest = await prisma.aiRequest.create({
      data: {
        organizationId: chat.organizationId,
        workspaceId: chat.workspaceId,
        userId: user.id,
        providerId: route.providerId ?? null,
        model: route.model,
        type: "STREAMING_CHAT_COMPLETION",
        status: "PENDING",
        chatId: chat.id,
        metadata: { userMessageId: userMessage.id }
      }
    });

    const stream = new ReadableStream({
      async start(controller) {
        let assistantContent = "";
        let usage = undefined as { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
        let selectedModel = route.model;
        try {
          const chunks = await retrieveWorkspaceContext({
            organizationId: chat.organizationId,
            workspaceId: chat.workspaceId,
            userId: user.id,
            query: input.content,
            aiRequestId: aiRequest.id
          });

          if (!chunks.length) {
            assistantContent = "I could not find that in the available sources.";
            controller.enqueue(encoder.encode(assistantContent));
          } else {
            await prisma.aiRequest.update({ where: { id: aiRequest.id }, data: { status: "STREAMING" } });
            const messages = buildRagMessages(input.content, chunks);
            const routedStream = await streamChatWithFallback({
              route,
              messages,
              temperature: 0.2,
              maxOutputTokens: readIntEnv("RAG_MAX_OUTPUT_TOKENS", 800)
            });
            if (routedStream.route.model !== route.model || routedStream.route.providerId !== route.providerId) {
              await prisma.aiRequest.update({
                where: { id: aiRequest.id },
                data: {
                  providerId: routedStream.route.providerId ?? null,
                  model: routedStream.route.model
                }
              });
            }
            selectedModel = routedStream.route.model;
            for await (const delta of routedStream) {
              if (delta.content) {
                assistantContent += delta.content;
                controller.enqueue(encoder.encode(delta.content));
              }
              if (delta.usage) usage = delta.usage;
            }
          }

          const assistantMessage = await prisma.message.create({
            data: {
              organizationId: chat.organizationId,
              workspaceId: chat.workspaceId,
              chatId: chat.id,
              role: "ASSISTANT",
              content: assistantContent
            }
          });

          if (chunks.length) {
            await prisma.messageCitation.createMany({
              data: chunks.map((chunk) => ({
                organizationId: chat.organizationId,
                workspaceId: chat.workspaceId,
                messageId: assistantMessage.id,
                documentChunkId: chunk.chunkId,
                sourceUrl: chunk.sourceUrl,
                title: chunk.title,
                score: chunk.score,
                quote: chunk.content.slice(0, 500)
              }))
            });
          }

          await prisma.aiRequest.update({
            where: { id: aiRequest.id },
            data: {
              status: "COMPLETED",
              messageId: assistantMessage.id,
              promptTokens: usage?.promptTokens ?? null,
              completionTokens: usage?.completionTokens ?? null,
              totalTokens: usage?.totalTokens ?? null
            }
          });
          await recordTokenUsage({
            organizationId: chat.organizationId,
            workspaceId: chat.workspaceId,
            userId: user.id,
            aiRequestId: aiRequest.id,
            model: selectedModel,
            type: "STREAMING_CHAT_COMPLETION",
            usage
          });
          await prisma.chat.update({
            where: { id: chat.id },
            data: {
              updatedAt: new Date(),
              title: chat.title === "New chat" ? input.content.slice(0, 80) : chat.title
            }
          });

          logInfo("chat.stream.completed", {
            organizationId: chat.organizationId,
            workspaceId: chat.workspaceId,
            chatId: chat.id,
            aiRequestId: aiRequest.id
          });
          controller.close();
        } catch (error) {
          logError("chat.stream.failed", error, { chatId: chat.id, aiRequestId: aiRequest.id });
          await prisma.aiRequest.update({
            where: { id: aiRequest.id },
            data: {
              status: "FAILED",
              errorMessage: error instanceof Error ? error.message : "Unknown AI failure"
            }
          });
          controller.enqueue(encoder.encode("\n\nThe assistant could not complete the response. Please try again."));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send message";
    return Response.json({ error: message }, { status: 400 });
  }
}
