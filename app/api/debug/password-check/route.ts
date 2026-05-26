import bcrypt from "bcryptjs";
import { authDebugNotFound, isAuthDebugEnabled } from "@/lib/auth-debug";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const debugEmail = "zeev@example.com";
const debugPassword = "zeev123";

export async function POST(request: Request) {
  if (!isAuthDebugEnabled()) return authDebugNotFound();

  const input = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = input?.email?.trim().toLowerCase();

  if (email !== debugEmail) {
    return Response.json({ error: "debug password check is only available for the configured test user" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true, passwordHash: true }
  });
  const passwordMatches = user?.passwordHash ? await bcrypt.compare(debugPassword, user.passwordHash) : false;

  return Response.json({
    userFound: Boolean(user),
    passwordMatches,
    authEligible: Boolean(user && user.deletedAt === null && user.passwordHash && passwordMatches)
  });
}
