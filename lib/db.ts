import { PrismaClient } from "@prisma/client";
import { readEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

export function assertDatabaseConfigured() {
  if (!readEnv("DATABASE_URL")) {
    throw new Error("DATABASE_URL is required to use database-backed features");
  }
}

export function getPrismaClient() {
  assertDatabaseConfigured();

  if (!globalForPrisma.prismaClient) {
    globalForPrisma.prismaClient = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
    });
  }

  return globalForPrisma.prismaClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  }
});
