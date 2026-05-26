import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readEnv } from "@/lib/env";
import { isAuthConfigured } from "@/lib/auth-runtime";
import { logError, logInfo } from "@/lib/observability/logger";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...(readEnv("DATABASE_URL") ? { adapter: PrismaAdapter(prisma) } : {}),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(rawCredentials) {
        if (!isAuthConfigured()) {
          logError("auth.credentials.missing_configuration", new Error("Auth secret is not configured"));
          throw new Error("Authentication is not configured");
        }

        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          logInfo("auth.credentials.invalid_payload", { reason: "invalid_credentials_shape" });
          return null;
        }

        const email = parsed.data.email.toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email }
        });

        if (!user?.passwordHash || user.deletedAt) {
          logInfo("auth.credentials.rejected", {
            email,
            reason: user?.deletedAt ? "deleted_user" : "missing_user_or_password_hash"
          });
          return null;
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          logInfo("auth.credentials.rejected", { email, reason: "invalid_password" });
          return null;
        }

        logInfo("auth.credentials.accepted", { email, userId: user.id });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image
        };
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      try {
        if (user?.id) {
          token.sub = user.id;
        }
      } catch (error) {
        logError("auth.callback.jwt_failed", error);
      }
      return token;
    },
    session({ session, token }) {
      try {
        if (session.user && token?.sub) {
          session.user.id = token.sub;
        }
      } catch (error) {
        logError("auth.callback.session_failed", error);
      }
      return session;
    }
  },
  logger: {
    error(error) {
      logError("auth.nextauth.error", error, {
        name: error.name,
        type: "type" in error ? error.type : undefined,
        cause: "cause" in error ? error.cause : undefined
      });
    },
    warn(code) {
      logInfo("auth.nextauth.warn", { code });
    },
    debug(message, metadata) {
      logInfo("auth.nextauth.debug", { message, metadata });
    }
  },
  trustHost: true
});
