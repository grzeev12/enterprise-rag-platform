"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BudgetFormProps = {
  organizationId: string;
  workspaceId?: string | null;
};

export function BudgetForm({ organizationId, workspaceId }: BudgetFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createBudget(formData: FormData) {
    setPending(true);
    setError(null);

    const response = await fetch("/api/finops/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        workspaceId,
        name: String(formData.get("name") ?? ""),
        amountUsd: Number(formData.get("amountUsd") ?? 0),
        thresholdPercent: Number(formData.get("thresholdPercent") ?? 80),
        period: String(formData.get("period") ?? "MONTHLY")
      })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Unable to create budget");
      setPending(false);
      return;
    }

    router.refresh();
    setPending(false);
  }

  return (
    <form action={createBudget} className="grid gap-3 md:grid-cols-[1fr_120px_120px_120px_auto] md:items-end">
      <div className="space-y-1">
        <Label htmlFor="budget-name">Budget name</Label>
        <Input id="budget-name" name="name" placeholder="Monthly AI spend" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="budget-amount">USD</Label>
        <Input id="budget-amount" min="1" name="amountUsd" required step="0.01" type="number" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="budget-threshold">Alert %</Label>
        <Input id="budget-threshold" max="100" min="1" name="thresholdPercent" type="number" defaultValue="80" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="budget-period">Period</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          id="budget-period"
          name="period"
          defaultValue="MONTHLY"
        >
          <option value="MONTHLY">Monthly</option>
          <option value="DAILY">Daily</option>
        </select>
      </div>
      <Button disabled={pending} type="submit">
        <Plus className="h-4 w-4" />
        {pending ? "Creating" : "Create"}
      </Button>
      {error ? <p className="text-sm text-destructive md:col-span-5">{error}</p> : null}
    </form>
  );
}
