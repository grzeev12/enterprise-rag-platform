import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const futureModules = [
  ["Knowledge ingestion", "Safe crawler, document upload, chunking, embeddings"],
  ["RAG chat", "Streaming chat, citations, source panel"],
  ["FinOps", "Token usage, cost tracking, budgets"],
  ["Multi-LLM gateway", "Provider adapters, routing, fallback policy"]
] as const;

export default async function DashboardPage() {
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
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      workspaces: {
        where: {
          deletedAt: null,
          OR: [
            {
              memberships: {
                some: {
                  userId: user.id,
                  deletedAt: null,
                  status: "ACTIVE"
                }
              }
            },
            {
              organization: {
                memberships: {
                  some: {
                    userId: user.id,
                    workspaceId: null,
                    deletedAt: null,
                    status: "ACTIVE"
                  }
                }
              }
            }
          ]
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Workspace dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tenant-scoped organizations and workspaces are ready for future ingestion and RAG modules.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/organizations/new">New organization</Link>
          </Button>
          <Button asChild>
            <Link href="/workspaces/new">New workspace</Link>
          </Button>
        </div>
      </div>

      {organizations.length ? (
        <div className="grid gap-4">
          {organizations.map((organization) => (
            <Card key={organization.id}>
              <CardHeader>
                <CardTitle>{organization.name}</CardTitle>
                <CardDescription>Tenant slug: {organization.slug}</CardDescription>
              </CardHeader>
              <CardContent>
                {organization.workspaces.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {organization.workspaces.map((workspace) => (
                      <div className="rounded-md border p-4" key={workspace.id}>
                        <p className="font-medium">{workspace.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{workspace.slug}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No workspaces yet.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <p className="text-sm text-muted-foreground">Create your first organization to start.</p>
            <Button asChild>
              <Link href="/organizations/new">Create organization</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-normal">Future module placeholders</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {futureModules.map(([title, description]) => (
            <div className="rounded-md border bg-muted/20 p-4" key={title}>
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
