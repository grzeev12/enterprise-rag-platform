import { prisma } from "@/lib/db";

export async function ensureOrganizationGovernance(organizationId: string) {
  const [aiPolicy, retention, compliance] = await Promise.all([
    prisma.organizationAiPolicy.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId }
    }),
    prisma.dataRetentionPolicy.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId }
    }),
    prisma.complianceSetting.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId }
    })
  ]);

  return { aiPolicy, retention, compliance };
}

export async function isFeatureEnabled(organizationId: string, key: string) {
  const flag = await prisma.featureFlag.findUnique({
    where: { organizationId_key: { organizationId, key } }
  });
  return Boolean(flag?.isEnabled);
}
