import bcrypt from "bcryptjs";
import { z } from "zod";
import { isAuthConfigured } from "@/lib/auth-runtime";
import { prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export type CredentialsAuthorizeResult =
  | {
      authorized: true;
      reason: "authorized";
      user: {
        id: string;
        name: string | null;
        email: string;
        image: string | null;
      };
    }
  | {
      authorized: false;
      reason:
        | "missing_configuration"
        | "invalid_credentials_shape"
        | "missing_user_or_password_hash"
        | "deleted_user"
        | "invalid_password";
      email?: string;
    };

export async function authorizeCredentials(rawCredentials: unknown): Promise<CredentialsAuthorizeResult> {
  if (!isAuthConfigured()) {
    return { authorized: false, reason: "missing_configuration" };
  }

  const parsed = credentialsSchema.safeParse(rawCredentials);
  if (!parsed.success) {
    return { authorized: false, reason: "invalid_credentials_shape" };
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user?.passwordHash || user.deletedAt) {
    return {
      authorized: false,
      email,
      reason: user?.deletedAt ? "deleted_user" : "missing_user_or_password_hash"
    };
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return { authorized: false, email, reason: "invalid_password" };
  }

  return {
    authorized: true,
    reason: "authorized",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image
    }
  };
}
