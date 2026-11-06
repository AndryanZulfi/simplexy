import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@simplexy/db";
import {
  agentChatMessages,
  agentChatSessions,
  agents,
  companies,
  issues,
} from "@simplexy/db";
import { notFound, unprocessable } from "../errors.js";
import { issueService } from "./issues.js";
import { logger } from "../middleware/logger.js";
import {
  resolveLocalWorkspaceGatewayApiKey,
  resolveLocalWorkspaceGatewayUrl,
} from "./local-workspace-agents.js";

export function agentDirectChatService(db: Db) {
  const issuesSvc = issueService(db);

  async function listSessions(companyId: string, agentId: string) {
    return db
      .select()
      .from(agentChatSessions)
      .where(
        and(
          eq(agentChatSessions.companyId, companyId),
          eq(agentChatSessions.agentId, agentId),
        ),
      )
      .orderBy(desc(agentChatSessions.updatedAt));
  }

  async function getSession(companyId: string, agentId: string, sessionId: string) {
    const [session] = await db
      .select()
      .from(agentChatSessions)
      .where(
        and(
          eq(agentChatSessions.companyId, companyId),
          eq(agentChatSessions.agentId, agentId),
          eq(agentChatSessions.id, sessionId),
        ),
      );
    return session ?? null;
  }

  async function createSession(
    companyId: string,
    agentId: string,
    userId: string,
    title?: string,
  ) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.companyId, companyId), eq(agents.id, agentId)));
    if (!agent) throw notFound("Agent not found");

    const [session] = await db
      .insert(agentChatSessions)
      .values({
        companyId,
        agentId,
        userId,
        title: title?.trim() || "New conversation",
      })
      .returning();
    return session!;
  }

  async function listMessages(companyId: string, sessionId: string) {
    const messages = await db
      .select({
        id: agentChatMessages.id,
        companyId: agentChatMessages.companyId,
        sessionId: agentChatMessages.sessionId,
        senderType: agentChatMessages.senderType,
        senderId: agentChatMessages.senderId,
        content: agentChatMessages.content,
        createdTaskId: agentChatMessages.createdTaskId,
        metadata: agentChatMessages.metadata,
        createdAt: agentChatMessages.createdAt,
        taskIdentifier: issues.identifier,
        taskTitle: issues.title,
      })
      .from(agentChatMessages)
      .leftJoin(issues, eq(agentChatMessages.createdTaskId, issues.id))
      .where(
        and(
          eq(agentChatMessages.companyId, companyId),
          eq(agentChatMessages.sessionId, sessionId),
        ),
      )
      .orderBy(agentChatMessages.createdAt);

    return messages.map((m) => ({
      id: m.id,
      companyId: m.companyId,
      sessionId: m.sessionId,
      senderType: m.senderType,
      senderId: m.senderId,
      content: m.content,
      createdTaskId: m.createdTaskId,
      createdTaskIdentifier: m.taskIdentifier,
      createdTaskTitle: m.taskTitle,
      metadata: m.metadata,
      createdAt: m.createdAt,
    }));
  }

  async function buildAgentSystemPrompt(companyId: string, agentId: string): Promise<string> {
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.companyId, companyId), eq(agents.id, agentId)));
    if (!agent) throw notFound("Agent not found");

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));

    const roleName = agent.role || "AI Specialist";
    const agentName = agent.name || "Agent";
    const companyName = company?.name || "Simplexy Organization";

    return [
      `You are "${agentName}", an AI agent with the role of "${roleName}" at ${companyName}.`,
      "You are in a direct conversational chat with a team member.",
      "Respond quickly, helpfully, and concisely in a natural professional tone.",
      "If the user asks you to execute a complex task, propose the plan and mention that this can be turned into an official Task on the board.",
    ].join("\n");
  }

  async function streamMessageResponse(
    companyId: string,
    agentId: string,
    sessionId: string,
    userMessage: string,
    userId: string,
    onChunk: (chunk: string) => Promise<void> | void,
  ) {
    const session = await getSession(companyId, agentId, sessionId);
    if (!session) throw notFound("Chat session not found");

    // 1. Save user message
    await db.insert(agentChatMessages).values({
      companyId,
      sessionId,
      senderType: "user",
      senderId: userId,
      content: userMessage,
    });

    // 2. Fetch history (limit to last 20 messages for speed)
    const history = await db
      .select()
      .from(agentChatMessages)
      .where(
        and(
          eq(agentChatMessages.companyId, companyId),
          eq(agentChatMessages.sessionId, sessionId),
        ),
      )
      .orderBy(desc(agentChatMessages.createdAt))
      .limit(20);

    const orderedHistory = history.reverse();
    const systemPrompt = await buildAgentSystemPrompt(companyId, agentId);

    const messagesPayload = [
      { role: "system", content: systemPrompt },
      ...orderedHistory.map((m) => ({
        role: m.senderType === "agent" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
    ];

    const baseUrl = resolveLocalWorkspaceGatewayUrl();
    const apiKey = resolveLocalWorkspaceGatewayApiKey() || "";
    const model =
      process.env.SIMPLEXY_LOCAL_PI_MODEL ||
      process.env.DEFAULT_LLM_MODEL ||
      "ag/gemini-3.8-flash";

    let fullAgentResponse = "";

    try {
      const upstreamRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: messagesPayload,
          stream: true,
          temperature: 0.7,
        }),
      });

      if (!upstreamRes.ok || !upstreamRes.body) {
        throw new Error(`Gateway returned HTTP ${upstreamRes.status}`);
      }

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = done ? "" : lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            let data;
            try {
              data = JSON.parse(trimmed.slice(6));
            } catch {
              // ignore malformed SSE line
              continue;
            }
            if (data.error) throw new Error("Gateway returned an error");
            const delta = data.choices?.[0]?.delta?.content;
            if (delta) {
              fullAgentResponse += delta;
              await onChunk(delta);
            }
          }
        }
        if (done) break;
      }
      if (!fullAgentResponse.trim()) throw new Error("Gateway returned an empty response");
    } catch (err) {
      logger.warn({ companyId, agentId, sessionId, model, error: err instanceof Error ? err.message : "Unknown error" }, "Direct chat model request failed");
      throw new Error("Unable to reach the chat model. Try again shortly.");
    }

    // 3. Save assistant message
    const [agentMsg] = await db
      .insert(agentChatMessages)
      .values({
        companyId,
        sessionId,
        senderType: "agent",
        senderId: agentId,
        content: fullAgentResponse,
      })
      .returning();

    // 4. Update session timestamp
    await db
      .update(agentChatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(agentChatSessions.id, sessionId));

    return agentMsg!;
  }

  async function promoteToTask(
    companyId: string,
    agentId: string,
    sessionId: string,
    messageId: string,
    input: { title: string; description?: string; priority?: "low" | "medium" | "high" | "urgent" },
    userId: string,
  ) {
    const [message] = await db
      .select()
      .from(agentChatMessages)
      .where(
        and(
          eq(agentChatMessages.companyId, companyId),
          eq(agentChatMessages.sessionId, sessionId),
          eq(agentChatMessages.id, messageId),
        ),
      );

    if (!message) throw notFound("Chat message not found");
    if (message.createdTaskId) {
      throw unprocessable("This message has already been converted to a task");
    }

    // Compile background context from chat message
    const descriptionWithContext = [
      input.description?.trim() || "",
      "",
      "---",
      "### Direct chat context:",
      `> ${message.content.split("\n").join("\n> ")}`,
    ]
      .filter(Boolean)
      .join("\n");

    const createdIssue = await issuesSvc.create(companyId, {
      title: input.title.trim(),
      description: descriptionWithContext,
      priority: input.priority || "medium",
      status: "todo",
      assigneeAgentId: agentId,
      createdByUserId: userId,
      responsibleUserId: userId,
      sourceChatSessionId: sessionId,
      sourceChatMessageId: messageId,
    });

    await db
      .update(agentChatMessages)
      .set({ createdTaskId: createdIssue.id })
      .where(eq(agentChatMessages.id, messageId));

    return {
      task: {
        id: createdIssue.id,
        identifier: createdIssue.identifier ?? null,
        title: createdIssue.title,
        status: createdIssue.status,
      },
      message: {
        id: messageId,
        createdTaskId: createdIssue.id,
      },
    };
  }

  return {
    listSessions,
    getSession,
    createSession,
    listMessages,
    streamMessageResponse,
    promoteToTask,
  };
}
