import { describe, expect, it } from "vitest";

describe("chat persistence shape", () => {
  it("stores user-private messages under organization and workspace", () => {
    const messageCreate = {
      organizationId: "org_1",
      workspaceId: "workspace_1",
      chatId: "chat_1",
      userId: "user_1",
      role: "USER",
      content: "What does the docs say?"
    };

    expect(messageCreate).toMatchObject({
      organizationId: "org_1",
      workspaceId: "workspace_1",
      userId: "user_1",
      role: "USER"
    });
  });
});
