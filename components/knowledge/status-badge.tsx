import { cn } from "@/lib/utils";

const tone = {
  PENDING: "bg-muted text-muted-foreground",
  READY: "bg-muted text-muted-foreground",
  CRAWLING: "bg-blue-50 text-blue-700",
  FETCHING: "bg-blue-50 text-blue-700",
  FETCHED: "bg-blue-50 text-blue-700",
  PROCESSING: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  PROCESSED: "bg-emerald-50 text-emerald-700",
  CHUNKED: "bg-emerald-50 text-emerald-700",
  PARTIALLY_COMPLETED: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  SKIPPED: "bg-slate-100 text-slate-700",
  BLOCKED: "bg-red-50 text-red-700",
  ARCHIVED: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-slate-100 text-slate-700"
} as Record<string, string>;

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-1 text-xs font-medium", tone[status] ?? tone.PENDING)}>
      {status.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}
