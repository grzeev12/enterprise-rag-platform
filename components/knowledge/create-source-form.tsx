"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WorkspaceOption = {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
};

export function CreateSourceForm({ workspaces }: { workspaces: WorkspaceOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const selected = workspaces.find((workspace) => workspace.id === String(formData.get("workspaceId")));
    if (!selected) {
      setError("Select a workspace");
      return;
    }

    const excludedPaths = String(formData.get("excludedPaths") ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/knowledge-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: selected.organizationId,
          workspaceId: selected.id,
          name: String(formData.get("name") ?? ""),
          baseUrl: String(formData.get("baseUrl") ?? ""),
          maxPages: Number(formData.get("maxPages") ?? 50),
          maxDepth: Number(formData.get("maxDepth") ?? 2),
          crawlDelayMs: Number(formData.get("crawlDelayMs") ?? 1000),
          excludedPaths
        })
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Unable to create source");
        return;
      }

      router.push(`/knowledge/${body.source.id}`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add website source</CardTitle>
        <CardDescription>The crawler will only fetch public pages allowed by safety checks and robots.txt.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="workspaceId">Workspace</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="workspaceId"
              name="workspaceId"
              required
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.organizationName} / {workspace.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Source name</Label>
            <Input id="name" name="name" placeholder="Product docs" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Public website URL</Label>
            <Input id="baseUrl" name="baseUrl" placeholder="https://example.com/docs" type="url" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="maxPages">Max pages</Label>
              <Input id="maxPages" name="maxPages" type="number" min={1} max={500} defaultValue={50} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxDepth">Max depth</Label>
              <Input id="maxDepth" name="maxDepth" type="number" min={0} max={5} defaultValue={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crawlDelayMs">Delay ms</Label>
              <Input id="crawlDelayMs" name="crawlDelayMs" type="number" min={500} max={60000} defaultValue={1000} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="excludedPaths">Excluded paths</Label>
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="excludedPaths"
              name="excludedPaths"
              placeholder="/account&#10;/checkout"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button disabled={pending || workspaces.length === 0} type="submit">
            {pending ? "Creating..." : "Create source"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
