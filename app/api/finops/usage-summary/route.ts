import { handleApiError, ok } from "@/lib/api";
import { requireCurrentUser } from "@/lib/current-user";
import { getFinopsOverview, parseDateRange } from "@/lib/finops";
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
    const filters = parseDateRange(searchParams);
    const overview = await getFinopsOverview(scope, filters);

    return ok({
      summary: overview.summary,
      trends: overview.trends,
      budgets: overview.budgets
    });
  } catch (error) {
    return handleApiError(error);
  }
}
