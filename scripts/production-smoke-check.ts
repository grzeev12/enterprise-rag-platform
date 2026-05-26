import { PrismaClient } from "@prisma/client";

type CountRow = {
  count: bigint;
};

type ExtensionRow = {
  extname: string;
  extversion: string;
};

const prisma = new PrismaClient();

async function count(query: TemplateStringsArray) {
  const rows = await prisma.$queryRaw<CountRow[]>(query);
  return Number(rows[0]?.count ?? BigInt(0));
}

async function main() {
  const connectivity = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
  if (connectivity[0]?.ok !== 1) {
    throw new Error("Database connectivity check failed");
  }

  const extensions = await prisma.$queryRaw<ExtensionRow[]>`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname = 'vector'
  `;

  if (!extensions.length) {
    throw new Error("pgvector extension is not enabled");
  }

  const [
    organizations,
    workspaces,
    memberships,
    workspaceTenantMismatches,
    membershipTenantMismatches,
    knowledgeSourceTenantMismatches,
    chatTenantMismatches,
    messageTenantMismatches
  ] = await Promise.all([
    count`SELECT COUNT(*)::bigint AS count FROM "Organization"`,
    count`SELECT COUNT(*)::bigint AS count FROM "Workspace"`,
    count`SELECT COUNT(*)::bigint AS count FROM "Membership"`,
    count`
      SELECT COUNT(*)::bigint AS count
      FROM "Workspace" w
      LEFT JOIN "Organization" o ON o.id = w."organizationId"
      WHERE o.id IS NULL
    `,
    count`
      SELECT COUNT(*)::bigint AS count
      FROM "Membership" m
      LEFT JOIN "Workspace" w ON w.id = m."workspaceId"
      WHERE m."workspaceId" IS NOT NULL
        AND w."organizationId" <> m."organizationId"
    `,
    count`
      SELECT COUNT(*)::bigint AS count
      FROM "KnowledgeSource" ks
      JOIN "Workspace" w ON w.id = ks."workspaceId"
      WHERE w."organizationId" <> ks."organizationId"
    `,
    count`
      SELECT COUNT(*)::bigint AS count
      FROM "Chat" c
      JOIN "Workspace" w ON w.id = c."workspaceId"
      WHERE w."organizationId" <> c."organizationId"
    `,
    count`
      SELECT COUNT(*)::bigint AS count
      FROM "Message" m
      JOIN "Chat" c ON c.id = m."chatId"
      WHERE c."organizationId" <> m."organizationId"
        OR c."workspaceId" <> m."workspaceId"
    `
  ]);

  const mismatches = {
    workspaceTenantMismatches,
    membershipTenantMismatches,
    knowledgeSourceTenantMismatches,
    chatTenantMismatches,
    messageTenantMismatches
  };
  const mismatchTotal = Object.values(mismatches).reduce((sum, value) => sum + value, 0);

  if (mismatchTotal > 0) {
    throw new Error(`Tenant integrity smoke check failed: ${JSON.stringify(mismatches)}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      pgvector: extensions[0],
      aggregateCounts: {
        organizations,
        workspaces,
        memberships
      },
      tenantIntegrity: mismatches
    })
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown production smoke-check failure";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
