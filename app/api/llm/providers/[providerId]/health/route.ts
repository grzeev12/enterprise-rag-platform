import { handleApiError, ok } from "@/lib/api";
import { getAdminScopes, resolveAdminScope } from "@/lib/admin";
import { checkProviderHealth } from "@/lib/ai/router";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{ providerId: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { providerId } = await params;
    const provider = await prisma.llmProvider.findUnique({ where: { id: providerId } });
    if (!provider) return Response.json({ error: "Provider not found" }, { status: 404 });

    if (provider.organizationId) {
      const scope = resolveAdminScope(await getAdminScopes(user.id), provider.organizationId);
      if (!scope || scope.workspaceId) {
        return Response.json({ error: "Organization admin access required" }, { status: 403 });
      }
    }

    const health = await checkProviderHealth(provider.id);
    return ok({ health });
  } catch (error) {
    return handleApiError(error);
  }
}
