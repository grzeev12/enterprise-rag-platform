import { ChatClient } from "@/components/chat/chat-client";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export default async function ChatPage() {
  const user = await requireCurrentUser();
  const organizations = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      memberships: {
        some: {
          userId: user.id,
          workspaceId: null,
          deletedAt: null,
          status: "ACTIVE"
        }
      }
    },
    include: {
      workspaces: {
        where: { deletedAt: null },
        select: { id: true, name: true, organizationId: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const workspaces = organizations.flatMap((organization) =>
    organization.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      organizationId: workspace.organizationId,
      organizationName: organization.name
    }))
  );

  const firstWorkspace = workspaces[0];
  const chats = firstWorkspace
    ? await prisma.chat.findMany({
        where: {
          organizationId: firstWorkspace.organizationId,
          workspaceId: firstWorkspace.id,
          userId: user.id,
          status: "ACTIVE"
        },
        orderBy: { updatedAt: "desc" },
        take: 30
      })
    : [];

  const initialChat = chats[0]
    ? await prisma.chat.findUnique({
        where: { id: chats[0].id },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            include: { citations: true }
          }
        }
      })
    : null;

  if (!workspaces.length) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Create a workspace before starting a chat.
        </CardContent>
      </Card>
    );
  }

  return (
    <ChatClient
      workspaces={workspaces}
      initialChats={chats.map((chat) => ({ id: chat.id, title: chat.title }))}
      initialChat={initialChat}
    />
  );
}
