import bcrypt from "bcryptjs";
import { z } from "zod";
import { created, handleApiError } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  try {
    const input = signupSchema.parse(await request.json());
    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      return Response.json({ error: "An account already exists for that email" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        passwordHash: await bcrypt.hash(input.password, 12)
      },
      select: { id: true, name: true, email: true }
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: "USER_SIGNED_UP",
      targetType: "USER",
      targetId: user.id
    });

    return created({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
