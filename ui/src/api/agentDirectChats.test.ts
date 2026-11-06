import { afterEach, describe, expect, it, vi } from "vitest";
import { agentDirectChatsApi } from "./agentDirectChats";

afterEach(() => vi.unstubAllGlobals());

describe("direct chat SSE event boundaries", () => {
  it.each(["", 'event: token\ndata: {"delta":"Hello"}\n\n'])(
    "reports unexpected EOF without a terminal event after %j",
    async (stream) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
      const onToken = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await agentDirectChatsApi.streamMessage(
        "company-1", "agent-1", "session-1", "Hello", onToken, onDone, onError,
      );

      expect(onError).toHaveBeenCalledExactlyOnceWith("The response stream ended before completion. Please try again.");
      expect(onDone).not.toHaveBeenCalled();
      expect(onToken.mock.calls).toEqual(stream ? [["Hello"]] : []);
    },
  );

  it("reports an error when its event and data arrive in separate reads", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("event: error\n"));
        controller.enqueue(encoder.encode('data: {"error":"Gateway unavailable"}\n\n'));
        controller.close();
      },
    }))));
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await agentDirectChatsApi.streamMessage(
      "company-1", "agent-1", "session-1", "Hello", onToken, onDone, onError,
    );

    expect(onError).toHaveBeenCalledExactlyOnceWith("Gateway unavailable");
    expect(onToken).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("delivers fragmented token and done events to their callbacks", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        for (const chunk of [
          "event: token\n",
          'data: {"delta":"Hello"}\n\n',
          "event: done\n",
          'data: {"messageId":"message-1","content":"Hello"}\n\n',
        ]) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }))));
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await agentDirectChatsApi.streamMessage(
      "company-1", "agent-1", "session-1", "Hello", onToken, onDone, onError,
    );

    expect(onToken).toHaveBeenCalledExactlyOnceWith("Hello");
    expect(onDone).toHaveBeenCalledExactlyOnceWith({ messageId: "message-1", content: "Hello" });
    expect(onError).not.toHaveBeenCalled();
  });
});
