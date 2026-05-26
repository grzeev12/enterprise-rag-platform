import { z } from "zod";
import { handleApiError, ok } from "@/lib/api";
import { requireWorkspaceAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{ chatId: string }>;
};

const renameSchema = z.object({
  title: z.string().trim().min(1).max(160)
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { chatId } = await params;
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId: user.id, status: "ACTIVE" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: { citations: true }
        }
      }
    });

    if (!chat) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    await requireWorkspaceAccess(user.id, chat.organizationId, chat.workspaceId, "chat:read");

    return ok({ chat });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { chatId } = await params;
    const input = renameSchema.parse(await request.json());
    const chat = await prisma.chat.findFirst({ where: { id: chatId, userId: user.id, status: "ACTIVE" } });

    if (!chat) return Response.json({ error: "Chat not found" }, { status: 404 });
    await requireWorkspaceAccess(user.id, chat.organizationId, chat.workspaceId, "chat:create");

    const updated = await prisma.chat.update({
      where: { id: chat.id },
      data: { title: input.title }
    });

    return ok({ chat: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { chatId } = await params;
    const chat = await prisma.chat.findFirst({ where: { id: chatId, userId: user.id, status: "ACTIVE" } });

    if (!chat) return Response.json({ error: "Chat not found" }, { status: 404 });
    await requireWorkspaceAccess(user.id, chat.organizationId, chat.workspaceId, "chat:create");

    const archived = await prisma.chat.update({
      where: { id: chat.id },
      data: { status: "ARCHIVED", archivedAt: new Date() }
    });

    await writeAuditLog({
      organizationId: chat.organizationId,
      workspaceId: chat.workspaceId,
      actorUserId: user.id,
      action: "CHAT_ARCHIVED",
      targetType: "CHAT",
      targetId: chat.id
    });

    return ok({ chat: archived });
  } catch (error) {
    return handleApiError(error);
  }
}
