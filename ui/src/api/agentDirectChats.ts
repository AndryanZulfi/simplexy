import type {
  AgentChatSession,
  AgentChatMessage,
  CreateAgentChatSessionRequest,
  PromoteChatToTaskRequest,
  PromoteChatToTaskResponse,
} from "@simplexy/shared";
import { api } from "./client";

export const agentDirectChatsApi = {
  listSessions: (companyId: string, agentId: string) =>
    api.get<AgentChatSession[]>(`/companies/${companyId}/agents/${agentId}/chats`),

  createSession: (
    companyId: string,
    agentId: string,
    data?: CreateAgentChatSessionRequest,
  ) =>
    api.post<AgentChatSession>(
      `/companies/${companyId}/agents/${agentId}/chats`,
      data ?? {},
    ),

  listMessages: (companyId: string, agentId: string, sessionId: string) =>
    api.get<AgentChatMessage[]>(
      `/companies/${companyId}/agents/${agentId}/chats/${sessionId}/messages`,
    ),

  promoteToTask: (
    companyId: string,
    agentId: string,
    sessionId: string,
    messageId: string,
    data: PromoteChatToTaskRequest,
  ) =>
    api.post<PromoteChatToTaskResponse>(
      `/companies/${companyId}/agents/${agentId}/chats/${sessionId}/messages/${messageId}/promote-to-task`,
      data,
    ),

  streamMessage: async (
    companyId: string,
    agentId: string,
    sessionId: string,
    content: string,
    onToken: (token: string) => void,
    onDone: (data: { messageId: string; content: string }) => void,
    onError: (err: string) => void,
    signal?: AbortSignal,
  ) => {
    try {
      const response = await fetch(
        `/api/companies/${companyId}/agents/${agentId}/chats/${sessionId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ content }),
          signal,
        },
      );

      if (!response.ok || !response.body) {
        throw new Error(`Gagal mengirim pesan: HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event: ")) {
            currentEvent = trimmed.slice(7).trim();
          } else if (trimmed.startsWith("data: ")) {
            try {
              const payload = JSON.parse(trimmed.slice(6));
              if (currentEvent === "token" && payload.delta) {
                onToken(payload.delta);
              } else if (currentEvent === "done") {
                onDone(payload);
              } else if (currentEvent === "error") {
                onError(payload.error || "Terjadi kesalahan stream");
              }
            } catch {
              // ignore malformed SSE
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      onError(err instanceof Error ? err.message : String(err));
    }
  },
};
