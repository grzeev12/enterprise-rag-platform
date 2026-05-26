"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type RetryActionProps = {
  id: string;
  type: "crawl" | "embedding";
};

export function RetryAction({ id, type }: RetryActionProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setIsPending(true);
    setError(null);

    const path =
      type === "crawl"
        ? `/api/admin/crawls/${id}/retry`
        : `/api/admin/embedding-jobs/${id}/retry`;

    const response = await fetch(path, { method: "POST" });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Retry failed");
      setIsPending(false);
      return;
    }

    router.refresh();
    setIsPending(false);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button disabled={isPending} onClick={retry} size="sm" type="button" variant="outline">
        <RotateCcw className="h-4 w-4" />
        {isPending ? "Retrying" : "Retry"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
