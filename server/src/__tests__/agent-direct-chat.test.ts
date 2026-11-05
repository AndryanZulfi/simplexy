import { describe, it, expect, vi, beforeEach } from "vitest";
import { agentDirectChatService } from "../services/agent-direct-chat.js";

describe("agentDirectChatService", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new chat session when agent exists", async () => {
    const mockAgent = { id: "agent-1", companyId: "company-1", name: "Zulfi", role: "ceo" };
    const mockSession = { id: "session-1", companyId: "company-1", agentId: "agent-1", title: "Test Chat" };

    // select agent
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([mockAgent]),
      }),
    });

    // insert session
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValueOnce({
        returning: vi.fn().mockResolvedValueOnce([mockSession]),
      }),
    });

    const svc = agentDirectChatService(mockDb);
    const result = await svc.createSession("company-1", "agent-1", "user-1", "Test Chat");

    expect(result).toEqual(mockSession);
  });

  it("throws notFound if agent does not exist during session creation", async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([]),
      }),
    });

    const svc = agentDirectChatService(mockDb);
    await expect(
      svc.createSession("company-1", "missing-agent", "user-1", "Test"),
    ).rejects.toThrow("Agent tidak ditemukan");
  });
});
