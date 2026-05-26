import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { readEnv } from "@/lib/env";
import { authorizeCredentials } from "@/lib/auth-credentials";
import { logError, logInfo } from "@/lib/observability/logger";

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
        const result = await authorizeCredentials(rawCredentials);

        if (!result.authorized) {
          if (result.reason === "missing_configuration") {
            logError("auth.credentials.missing_configuration", new Error("Auth secret is not configured"));
            throw new Error("Authentication is not configured");
          }
          if (result.reason === "invalid_credentials_shape") {
            logInfo("auth.credentials.invalid_payload", { reason: result.reason });
            return null;
          }
          logInfo("auth.credentials.rejected", { email: result.email, reason: result.reason });
          return null;
        }

        logInfo("auth.credentials.accepted", { email: result.user.email, userId: result.user.id });

        return result.user;
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
