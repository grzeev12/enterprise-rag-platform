"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OrganizationOption = {
  id: string;
  name: string;
};

export function CreateWorkspaceForm({ organizations }: { organizations: OrganizationOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const organizationId = String(formData.get("organizationId") ?? "");
    const name = String(formData.get("name") ?? "");

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, name })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Unable to create workspace");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create workspace</CardTitle>
        <CardDescription>Workspaces isolate knowledge sources, chats, and future RAG settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="organizationId">Organization</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="organizationId"
              name="organizationId"
              required
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Workspace name</Label>
            <Input id="name" name="name" placeholder="Support Knowledge Base" required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button disabled={pending || organizations.length === 0} type="submit">
            {pending ? "Creating..." : "Create workspace"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
