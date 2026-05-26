"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SourceActions({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startCrawl() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/knowledge-sources/${sourceId}/crawl`, {
        method: "POST"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Unable to start crawl");
        return;
      }
      router.refresh();
    });
  }

  function archiveSource() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/knowledge-sources/${sourceId}`, {
        method: "DELETE"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Unable to archive source");
        return;
      }
      router.push("/knowledge");
      router.refresh();
    });
  }

  function indexSource() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/knowledge-sources/${sourceId}/embeddings`, {
        method: "POST"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Unable to start indexing");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={startCrawl} type="button">
          {pending ? "Working..." : "Start crawl"}
        </Button>
        <Button disabled={pending} onClick={indexSource} type="button" variant="secondary">
          Generate embeddings / index source
        </Button>
        <Button disabled={pending} onClick={archiveSource} type="button" variant="outline">
          Archive source
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
