"use client";

import { Activity, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { providerCatalog, type ProviderKey } from "@/lib/ai/gateway";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProviderForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function save(formData: FormData) {
    setError(null);
    const key = String(formData.get("key")) as ProviderKey;
    const response = await fetch("/api/llm/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        key,
        name: providerCatalog[key].name,
        apiKeySecretRef: String(formData.get("apiKeySecretRef") || providerCatalog[key].envVar),
        baseUrl: String(formData.get("baseUrl") || "") || null,
        timeoutMs: Number(formData.get("timeoutMs") || 30000),
        maxRetries: Number(formData.get("maxRetries") || 2),
        isEnabled: true
      })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Unable to save provider");
      return;
    }
    router.refresh();
  }

  return (
    <form action={save} className="grid gap-3 md:grid-cols-[160px_1fr_1fr_120px_100px_auto] md:items-end">
      <div className="space-y-1">
        <Label htmlFor="provider-key">Provider</Label>
        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="provider-key" name="key" defaultValue="openai">
          {Object.entries(providerCatalog).map(([key, provider]) => (
            <option key={key} value={key}>{provider.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="secret-ref">Secret env/key ref</Label>
        <Input id="secret-ref" name="apiKeySecretRef" placeholder="OPENAI_API_KEY" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="base-url">Base URL</Label>
        <Input id="base-url" name="baseUrl" placeholder="https://..." />
      </div>
      <div className="space-y-1">
        <Label htmlFor="timeout">Timeout</Label>
        <Input id="timeout" name="timeoutMs" type="number" defaultValue="30000" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="retries">Retries</Label>
        <Input id="retries" name="maxRetries" type="number" defaultValue="2" />
      </div>
      <Button type="submit"><Plus className="h-4 w-4" />Save</Button>
      {error ? <p className="text-sm text-destructive md:col-span-6">{error}</p> : null}
    </form>
  );
}

export function HealthCheckButton({ providerId }: { providerId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function check() {
    setPending(true);
    await fetch(`/api/llm/providers/${providerId}/health`, { method: "POST" });
    router.refresh();
    setPending(false);
  }

  return (
    <Button disabled={pending} onClick={check} size="sm" type="button" variant="outline">
      <Activity className="h-4 w-4" />
      {pending ? "Checking" : "Check"}
    </Button>
  );
}
