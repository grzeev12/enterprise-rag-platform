import Link from "next/link";
import { CreateWorkspaceForm } from "@/components/forms/create-workspace-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export default async function NewWorkspacePage() {
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
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" }
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">New workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Workspace data is always scoped to an organization membership.
        </p>
      </div>
      {organizations.length ? (
        <CreateWorkspaceForm organizations={organizations} />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <p className="text-sm text-muted-foreground">Create an organization before adding workspaces.</p>
            <Button asChild>
              <Link href="/organizations/new">Create organization</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
