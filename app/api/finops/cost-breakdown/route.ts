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
    const overview = await getFinopsOverview(scope, parseDateRange(searchParams));

    return ok({
      breakdown: overview.breakdown,
      aiRequests: overview.aiRequests
    });
  } catch (error) {
    return handleApiError(error);
  }
}
