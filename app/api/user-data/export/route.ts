import { z } from "zod";
import { handleApiError, ok } from "@/lib/api";
import { requireOrganizationAccess } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";

const requestSchema = z.object({
  organizationId: z.string().cuid(),
  userId: z.string().cuid()
});

export async function POST(request: Request) {
  try {
    const actor = await requireCurrentUser();
    const input = requestSchema.parse(await request.json());
    await requireOrganizationAccess(actor.id, input.organizationId, "governance:manage");

    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: actor.id,
      action: "USER_DATA_EXPORT_REQUESTED",
      targetType: "USER_DATA_REQUEST",
      targetId: input.userId,
      metadata: { scaffold: true }
    });

    return ok({ status: "queued_scaffold", userId: input.userId });
  } catch (error) {
    return handleApiError(error);
  }
}
