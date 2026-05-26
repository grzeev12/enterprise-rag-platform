import { z } from "zod";
import { handleApiError, ok } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return ok({ user });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = profileSchema.parse(await request.json());

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name: input.name },
      select: { id: true, name: true, email: true, image: true }
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: "USER_PROFILE_UPDATED",
      targetType: "USER",
      targetId: user.id
    });

    return ok({ user: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
