import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { agentDirectChatService } from "../services/agent-direct-chat.js";
import { logger } from "../middleware/logger.js";

describe("agentDirectChatService", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["", "\n\n"],
    ['data: {"choices":[{"delta":{"content":"Partial reply"}}]}\n\n', "\n\n"],
    ['data: {"choices":[{"delta":{"content":"Partial reply"}}]}\n\n', ""],
  ])(
    "rejects an upstream error event after %j with ending %j without saving an agent reply",
    async (prefix, ending) => {
      const session = { id: "session-1", companyId: "company-1", agentId: "agent-1" };
      mockDb.select
        .mockReturnValueOnce({ from: () => ({ where: async () => [session] }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ name: "Zulfi" }] }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ name: "Company" }] }) });
      const values = vi.fn().mockReturnValue({ returning: async () => [{}] });
      mockDb.insert.mockReturnValue({ values });
      mockDb.update.mockReturnValue({ set: () => ({ where: async () => [] }) });
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
        `${prefix}data: ${JSON.stringify({ error: { message: "private upstream payload", apiKey: "private-api-key" } })}${ending}`,
        { status: 200, headers: { "content-type": "text/event-stream" } },
      )));
      const onChunk = vi.fn();

      await expect(agentDirectChatService(mockDb).streamMessageResponse(
        "company-1", "agent-1", "session-1", "Hi", "user-1", onChunk,
      )).rejects.toThrow("Unable to reach the chat model. Try again shortly.");
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledWith({
        companyId: "company-1", sessionId: "session-1", senderType: "user", senderId: "user-1", content: "Hi",
      });
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(onChunk.mock.calls).toEqual(prefix ? [["Partial reply"]] : []);
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ error: "Gateway returned an error" }), "Direct chat model request failed");
      expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
    },
  );

  it.each([
    ["empty stream", ""],
    ["done-only stream", "data: [DONE]\n\n"],
    ["metadata-only stream", 'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'],
    ["whitespace-only stream", `data: ${JSON.stringify({ choices: [{ delta: { content: " \n\t " } }] })}\n\n`],
  ])("rejects an %s without saving an agent reply", async (_name, body) => {
    const session = { id: "session-1", companyId: "company-1", agentId: "agent-1" };
    mockDb.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [session] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ name: "Zulfi" }] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ name: "Company" }] }) });
    const values = vi.fn().mockReturnValue({ returning: async () => [{}] });
    mockDb.insert.mockReturnValue({ values });
    mockDb.update.mockReturnValue({ set: () => ({ where: async () => [] }) });
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      status: 200, headers: { "content-type": "text/event-stream" },
    })));

    await expect(agentDirectChatService(mockDb).streamMessageResponse(
      "company-1", "agent-1", "session-1", "Hi", "user-1", vi.fn(),
    )).rejects.toThrow("Unable to reach the chat model. Try again shortly.");
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      companyId: "company-1", sessionId: "session-1", senderType: "user", senderId: "user-1", content: "Hi",
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it.each(["\n\n", ""])("saves valid content with ending %j while ignoring malformed lines", async (ending) => {
    const session = { id: "session-1", companyId: "company-1", agentId: "agent-1" };
    mockDb.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [session] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ name: "Zulfi" }] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ name: "Company" }] }) });
    const agentMessage = { id: "message-1", content: "  Hello  " };
    const values = vi.fn().mockReturnValue({ returning: async () => [agentMessage] });
    mockDb.insert.mockReturnValue({ values });
    mockDb.update.mockReturnValue({ set: () => ({ where: async () => [] }) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      `: keepalive\ndata: invalid-json\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: agentMessage.content } }] })}${ending}`,
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));
    const onChunk = vi.fn();

    const result = await agentDirectChatService(mockDb).streamMessageResponse(
      "company-1", "agent-1", "session-1", "Hi", "user-1", onChunk,
    );
    expect(result).toEqual(agentMessage);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
    expect(values).toHaveBeenLastCalledWith({
      companyId: "company-1", sessionId: "session-1", senderType: "agent", senderId: "agent-1", content: agentMessage.content,
    });
    expect(onChunk).toHaveBeenCalledExactlyOnceWith(agentMessage.content);
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it("reports an unreachable gateway instead of saving a fake agent reply", async () => {
    const session = { id: "session-1", companyId: "company-1", agentId: "agent-1" };
    mockDb.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [session] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ name: "Zulfi" }] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ name: "Company" }] }) });
    mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: async () => [{}] }) });
    mockDb.update.mockReturnValue({ set: () => ({ where: async () => [] }) });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed", {
      cause: Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" }),
    })));
    const onChunk = vi.fn();
    await expect(agentDirectChatService(mockDb).streamMessageResponse(
      "company-1", "agent-1", "session-1", "Hi", "user-1", onChunk,
    )).rejects.toThrow("Unable to reach the chat model. Try again shortly.");
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(onChunk).not.toHaveBeenCalled();
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
    ).rejects.toThrow("Agent not found");
  });
});
