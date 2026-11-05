export type AgentChatSenderType = "user" | "agent" | "system";

export interface AgentChatSession {
  id: string;
  companyId: string;
  agentId: string;
  userId: string;
  title: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AgentChatMessage {
  id: string;
  companyId: string;
  sessionId: string;
  senderType: AgentChatSenderType;
  senderId: string;
  content: string;
  createdTaskId?: string | null;
  createdTaskIdentifier?: string | null;
  createdTaskTitle?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
}

export interface CreateAgentChatSessionRequest {
  title?: string;
}

export interface SendAgentChatMessageRequest {
  content: string;
}

export interface PromoteChatToTaskRequest {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
}

export interface PromoteChatToTaskResponse {
  task: {
    id: string;
    identifier: string | null;
    title: string;
    status: string;
  };
  message: {
    id: string;
    createdTaskId: string;
  };
}
