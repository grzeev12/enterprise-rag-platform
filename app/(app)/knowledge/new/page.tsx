import Link from "next/link";
import { CreateSourceForm } from "@/components/knowledge/create-source-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export default async function NewKnowledgeSourcePage() {
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

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Add website source</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The crawler respects robots.txt, rate limits, allowed domains, excluded paths, and response size limits.
        </p>
      </div>
      {workspaces.length ? (
        <CreateSourceForm workspaces={workspaces} />
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <p className="text-sm text-muted-foreground">Create a workspace before adding knowledge sources.</p>
            <Button asChild>
              <Link href="/workspaces/new">Create workspace</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
