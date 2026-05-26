import { z } from "zod";
import { created, handleApiError, ok } from "@/lib/api";
import { requireWorkspaceAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const createChatSchema = z.object({
  organizationId: z.string().cuid(),
  workspaceId: z.string().cuid(),
  title: z.string().trim().min(1).max(160).default("New chat")
});

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const workspaceId = searchParams.get("workspaceId");

    if (!organizationId || !workspaceId) {
      return Response.json({ error: "organizationId and workspaceId are required" }, { status: 400 });
    }

    await requireWorkspaceAccess(user.id, organizationId, workspaceId, "chat:read");

    const chats = await prisma.chat.findMany({
      where: {
        organizationId,
        workspaceId,
        userId: user.id,
        status: "ACTIVE"
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } }
      }
    });

    return ok({ chats });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = createChatSchema.parse(await request.json());

    await requireWorkspaceAccess(user.id, input.organizationId, input.workspaceId, "chat:create");

    const chat = await prisma.chat.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        userId: user.id,
        title: input.title
      }
    });

    await writeAuditLog({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      actorUserId: user.id,
      action: "CHAT_CREATED",
      targetType: "CHAT",
      targetId: chat.id
    });

    return created({ chat });
  } catch (error) {
    return handleApiError(error);
  }
}
