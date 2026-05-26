import Link from "next/link";
import { notFound } from "next/navigation";
import { SourceActions } from "@/components/knowledge/source-actions";
import { StatusBadge } from "@/components/knowledge/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireWorkspaceAccess } from "@/lib/authz";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

type PageRow = {
  id: string;
  normalizedUrl: string;
  depth: number;
  status: string;
  httpStatus: number | null;
  title: string | null;
  errorMessage: string | null;
  document: {
    _count: {
      chunks: number;
    };
  } | null;
};

type PageProps = {
  params: Promise<{ sourceId: string }>;
};

export default async function KnowledgeSourceDetailPage({ params }: PageProps) {
  const user = await requireCurrentUser();
  const { sourceId } = await params;
  const source = await prisma.knowledgeSource.findFirst({
    where: { id: sourceId, deletedAt: null },
    include: {
      organization: { select: { name: true } },
      workspace: { select: { name: true } },
      crawls: {
        orderBy: { createdAt: "desc" },
        take: 5
      },
      embeddingJobs: {
        orderBy: { createdAt: "desc" },
        take: 3
      }
    }
  });

  if (!source) {
    notFound();
  }

  await requireWorkspaceAccess(user.id, source.organizationId, source.workspaceId, "source:read");

  const latestCrawl = source.crawls[0];
  const latestEmbeddingJob = source.embeddingJobs[0];
  const pages = latestCrawl
    ? await prisma.crawlPage.findMany({
        where: { crawlId: latestCrawl.id },
        orderBy: [{ status: "asc" }, { depth: "asc" }, { createdAt: "asc" }],
        take: 250,
        include: {
          document: {
            select: {
              id: true,
              status: true,
              _count: { select: { chunks: true } }
            }
          }
        }
      })
    : [];

  const failedPages = pages.filter((page) => ["FAILED", "BLOCKED", "SKIPPED"].includes(page.status));
  const processedPages = pages.filter((page) => page.status === "PROCESSED");

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Button asChild className="mb-4" size="sm" variant="outline">
            <Link href="/knowledge">Back to sources</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-normal">{source.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {source.organization.name} / {source.workspace.name}
          </p>
        </div>
        <StatusBadge status={source.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Crawl settings</CardTitle>
          <CardDescription>{source.baseUrl}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Max pages</p>
            <p>{source.maxPages}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Max depth</p>
            <p>{source.maxDepth}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Delay</p>
            <p>{source.crawlDelayMs}ms</p>
          </div>
          <div>
            <p className="text-muted-foreground">Allowed domains</p>
            <p>{source.allowedDomains.join(", ")}</p>
          </div>
          <div className="sm:col-span-4">
            <SourceActions sourceId={source.id} />
          </div>
        </CardContent>
      </Card>

      {latestCrawl ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row">
              <div>
                <CardTitle>Crawl status</CardTitle>
                <CardDescription>Latest crawl: {latestCrawl.id}</CardDescription>
              </div>
              <StatusBadge status={latestCrawl.status} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-5">
            <div>
              <p className="text-muted-foreground">Discovered</p>
              <p>{latestCrawl.pagesDiscovered}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fetched</p>
              <p>{latestCrawl.pagesFetched}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Processed</p>
              <p>{latestCrawl.pagesProcessed}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Failed</p>
              <p>{latestCrawl.pagesFailed}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Started</p>
              <p>{latestCrawl.startedAt?.toLocaleString() ?? "pending"}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {latestEmbeddingJob ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 sm:flex-row">
              <div>
                <CardTitle>Embedding status</CardTitle>
                <CardDescription>Latest indexing job: {latestEmbeddingJob.id}</CardDescription>
              </div>
              <StatusBadge status={latestEmbeddingJob.status} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Model</p>
              <p>{latestEmbeddingJob.model}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total chunks</p>
              <p>{latestEmbeddingJob.totalChunks}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Indexed</p>
              <p>{latestEmbeddingJob.embeddedChunks}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Failed</p>
              <p>{latestEmbeddingJob.failedChunks}</p>
            </div>
            {latestEmbeddingJob.errorMessage ? (
              <div className="sm:col-span-4">
                <p className="text-muted-foreground">Error</p>
                <p className="text-destructive">{latestEmbeddingJob.errorMessage}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <PagesTable title="Indexed pages" description="Pages with extracted text and chunks." pages={processedPages} />
      <PagesTable title="Failed or skipped pages" description="Pages blocked, skipped, or failed during processing." pages={failedPages} />
      <PagesTable title="All discovered pages" description="Current page-level crawl state." pages={pages} />
    </div>
  );
}

function PagesTable({
  title,
  description,
  pages
}: {
  title: string;
  description: string;
  pages: PageRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {pages.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">URL</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Depth</th>
                  <th className="py-2 pr-4 font-medium">HTTP</th>
                  <th className="py-2 pr-4 font-medium">Chunks</th>
                  <th className="py-2 pr-4 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr className="border-b last:border-0" key={page.id}>
                    <td className="max-w-[280px] truncate py-3 pr-4">{page.title ?? page.normalizedUrl}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={page.status} />
                    </td>
                    <td className="py-3 pr-4">{page.depth}</td>
                    <td className="py-3 pr-4">{page.httpStatus ?? "-"}</td>
                    <td className="py-3 pr-4">{page.document?._count.chunks ?? 0}</td>
                    <td className="max-w-[240px] truncate py-3 pr-4">{page.errorMessage ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No pages to show.</p>
        )}
      </CardContent>
    </Card>
  );
}
