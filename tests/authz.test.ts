import { describe, expect, it } from "vitest";
import { membershipHasPermission } from "@/lib/authz";

describe("workspace access helpers", () => {
  it("checks permissions from membership role grants", () => {
    const membership = {
      role: {
        rolePermissions: [{ permission: { key: "chat:create" } }]
      }
    };

    expect(membershipHasPermission(membership as never, "chat:create")).toBe(true);
    expect(membershipHasPermission(membership as never, "source:delete")).toBe(false);
  });
});
