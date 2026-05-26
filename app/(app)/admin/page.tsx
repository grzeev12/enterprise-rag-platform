import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export default async function AdminPage() {
  const user = await requireCurrentUser();
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { actorUserId: user.id },
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
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Admin dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Phase 1 shows audit activity. User management, worker health, and errors arrive in later phases.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent audit logs</CardTitle>
          <CardDescription>Core tenant actions are recorded as immutable events.</CardDescription>
        </CardHeader>
        <CardContent>
          {auditLogs.length ? (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div className="rounded-md border p-3" key={log.id}>
                  <p className="text-sm font-medium">{log.action}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {log.targetType} {log.targetId} · {log.createdAt.toISOString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No audit logs yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
