import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Set up your tenant</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create an organization first, then add a workspace for isolated knowledge and chat data.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Foundation checklist</CardTitle>
          <CardDescription>Phase 1 prepares the platform boundary before ingestion or RAG.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-4">
              <p className="font-medium">Organization</p>
              <p className="mt-1 text-sm text-muted-foreground">Tenant-level users, roles, and audit logs.</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="font-medium">Workspace</p>
              <p className="mt-1 text-sm text-muted-foreground">Future home for sources, chats, and retrieval policy.</p>
            </div>
          </div>
          <Button asChild>
            <Link href="/organizations/new">Create organization</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
