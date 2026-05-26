import { z } from "zod";
import { handleApiError, ok } from "@/lib/api";
import { requireOrganizationAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";

const inviteSchema = z.object({
  organizationId: z.string().cuid(),
  workspaceId: z.string().cuid().optional(),
  email: z.string().email()
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = inviteSchema.parse(await request.json());

    await requireOrganizationAccess(user.id, input.organizationId, "member:invite");

    await writeAuditLog({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId ?? null,
      actorUserId: user.id,
      action: "USER_INVITED",
      targetType: "MEMBERSHIP",
      targetId: input.email,
      metadata: {
        email: input.email,
        status: "scaffolded"
      }
    });

    return ok({
      invite: {
        email: input.email,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId ?? null,
        status: "scaffolded"
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
