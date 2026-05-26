import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/knowledge/status-badge";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export default async function KnowledgeSourcesPage() {
  const user = await requireCurrentUser();
  const sources = await prisma.knowledgeSource.findMany({
    where: {
      deletedAt: null,
      workspace: {
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
      }
    },
    include: {
      workspace: { select: { name: true } },
      organization: { select: { name: true } },
      crawls: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      _count: { select: { pages: true, documents: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Knowledge sources</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Website ingestion is workspace-scoped and runs through the background queue.
          </p>
        </div>
        <Button asChild>
          <Link href="/knowledge/new">Add website</Link>
        </Button>
      </div>

      {sources.length ? (
        <div className="grid gap-4">
          {sources.map((source) => {
            const latestCrawl = source.crawls[0];
            return (
              <Card key={source.id}>
                <CardHeader>
                  <div className="flex flex-col justify-between gap-3 sm:flex-row">
                    <div>
                      <CardTitle>
                        <Link className="no-underline hover:underline" href={`/knowledge/${source.id}`}>
                          {source.name}
                        </Link>
                      </CardTitle>
                      <CardDescription>
                        {source.organization.name} / {source.workspace.name}
                      </CardDescription>
                    </div>
                    <StatusBadge status={source.status} />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground">Base URL</p>
                    <p className="truncate">{source.baseUrl}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pages</p>
                    <p>{source._count.pages}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Latest crawl</p>
                    <p>{latestCrawl ? latestCrawl.status.toLowerCase().replaceAll("_", " ") : "not started"}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-6">
            <p className="text-sm text-muted-foreground">No knowledge sources yet.</p>
            <Button asChild>
              <Link href="/knowledge/new">Add website</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
