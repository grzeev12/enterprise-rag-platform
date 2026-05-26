import { describe, expect, it } from "vitest";
import { resolveAdminScope, adminTenantWhere, type AdminScope } from "@/lib/admin";

const scopes: AdminScope[] = [
  {
    organizationId: "org_1",
    organizationName: "Acme",
    workspaceId: null,
    workspaceName: null
  },
  {
    organizationId: "org_2",
    organizationName: "Beta",
    workspaceId: "workspace_2",
    workspaceName: "Support"
  }
];

describe("admin scope helpers", () => {
  it("allows organization admins to scope down to a workspace in their organization", () => {
    const scope = resolveAdminScope(scopes, "org_1", "workspace_1");

    expect(scope).toMatchObject({
      organizationId: "org_1",
      workspaceId: "workspace_1"
    });
    expect(adminTenantWhere(scope!)).toEqual({
      organizationId: "org_1",
      workspaceId: "workspace_1"
    });
  });

  it("does not resolve a workspace admin outside their assigned workspace", () => {
    const scope = resolveAdminScope(scopes, "org_2", "workspace_other");

    expect(scope).toEqual(scopes[0]);
  });
});
