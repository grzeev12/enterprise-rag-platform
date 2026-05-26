import { ApiError } from "@/lib/api";
import { getAdminScopes, resolveAdminScope } from "@/lib/admin";

export async function requireFinopsScope(
  userId: string,
  organizationId?: string | null,
  workspaceId?: string | null
) {
  const scopes = await getAdminScopes(userId);
  const scope = resolveAdminScope(scopes, organizationId, workspaceId);

  if (!scope) {
    throw new ApiError(403, "Admin access required");
  }

  if (organizationId && scope.organizationId !== organizationId) {
    throw new ApiError(403, "Admin access required");
  }

  if (workspaceId && scope.workspaceId && scope.workspaceId !== workspaceId) {
    throw new ApiError(403, "Admin access required");
  }

  if (!workspaceId && organizationId && scope.workspaceId) {
    throw new ApiError(403, "Organization admin access required");
  }

  return scope;
}
