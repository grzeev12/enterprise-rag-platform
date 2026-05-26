import { requireCurrentUser } from "@/lib/current-user";
import { handleApiError } from "@/lib/api";
import { getUsageEvents, parseDateRange, estimateUsageCostUsd, providerForEvent } from "@/lib/finops";
import { requireFinopsScope } from "@/lib/finops-auth";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const scope = await requireFinopsScope(
      user.id,
      searchParams.get("organizationId"),
      searchParams.get("workspaceId")
    );
    const events = await getUsageEvents(scope, parseDateRange(searchParams));
    const rows = [
      ["createdAt", "workspace", "user", "provider", "model", "type", "promptTokens", "completionTokens", "totalTokens", "estimatedCostUsd"],
      ...events.map((event) => [
        event.createdAt.toISOString(),
        event.workspace.name,
        event.aiRequest?.user?.email ?? event.userId ?? "",
        providerForEvent(event),
        event.model,
        event.type,
        String(event.promptTokens),
        String(event.completionTokens),
        String(event.totalTokens),
        estimateUsageCostUsd(event).toFixed(8)
      ])
    ];

    return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=finops-usage.csv"
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}
