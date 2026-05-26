"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ModelFormProps = {
  organizationId: string;
  providers: { id: string; name: string }[];
  workspaces: { id: string; name: string }[];
};

export function ModelForm({ organizationId, providers, workspaces }: ModelFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function save(formData: FormData) {
    setError(null);
    const response = await fetch("/api/llm/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        workspaceId: String(formData.get("workspaceId") || "") || null,
        providerId: String(formData.get("providerId") ?? ""),
        key: String(formData.get("key") ?? ""),
        displayName: String(formData.get("displayName") ?? ""),
        kind: String(formData.get("kind") ?? "chat"),
        modelName: String(formData.get("modelName") ?? ""),
        routingPolicy: String(formData.get("routingPolicy") ?? "DEFAULT"),
        priority: Number(formData.get("priority") || 100),
        qualityTier: Number(formData.get("qualityTier") || 3),
        expectedLatencyMs: Number(formData.get("expectedLatencyMs") || 0) || null,
        isDefault: formData.get("isDefault") === "on",
        isAllowed: formData.get("isBlocked") !== "on",
        isBlocked: formData.get("isBlocked") === "on",
        isEnabled: true
      })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Unable to save model");
      return;
    }
    router.refresh();
  }

  return (
    <form action={save} className="grid gap-3 md:grid-cols-4 md:items-end">
      <Field label="Key" name="key" placeholder="openai-chat" />
      <Field label="Display" name="displayName" placeholder="OpenAI Chat" />
      <Field label="Model" name="modelName" placeholder="gpt-4o-mini" />
      <div className="space-y-1">
        <Label htmlFor="providerId">Provider</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="providerId" name="providerId" required>
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="workspaceId">Workspace</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="workspaceId" name="workspaceId">
          <option value="">Organization default</option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="kind">Kind</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="kind" name="kind" defaultValue="chat">
          <option value="chat">Chat</option>
          <option value="embedding">Embedding</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="routingPolicy">Routing</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="routingPolicy" name="routingPolicy" defaultValue="DEFAULT">
          <option value="DEFAULT">Default</option>
          <option value="COST_FIRST">Cost first</option>
          <option value="LATENCY_FIRST">Latency first</option>
          <option value="QUALITY_FIRST">Quality first</option>
          <option value="FALLBACK_CHAIN">Fallback chain</option>
        </select>
      </div>
      <Field label="Priority" name="priority" type="number" placeholder="100" />
      <Field label="Quality" name="qualityTier" type="number" placeholder="3" />
      <Field label="Latency ms" name="expectedLatencyMs" type="number" placeholder="1200" />
      <label className="flex h-10 items-center gap-2 text-sm">
        <input name="isDefault" type="checkbox" /> Default
      </label>
      <label className="flex h-10 items-center gap-2 text-sm">
        <input name="isBlocked" type="checkbox" /> Blocked
      </label>
      <Button type="submit"><Plus className="h-4 w-4" />Save model</Button>
      {error ? <p className="text-sm text-destructive md:col-span-4">{error}</p> : null}
    </form>
  );
}

function Field({ label, name, placeholder, type = "text" }: { label: string; name: string; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} placeholder={placeholder} type={type} required={name !== "expectedLatencyMs"} />
    </div>
  );
}
