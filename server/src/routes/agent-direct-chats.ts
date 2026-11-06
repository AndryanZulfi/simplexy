import { Router } from "express";
import type { Db } from "@simplexy/db";
import {
  createAgentChatSessionSchema,
  sendAgentChatMessageSchema,
  promoteChatToTaskSchema,
} from "@simplexy/shared";
import { assertCompanyAccess } from "./authz.js";
import { validate } from "../middleware/validate.js";
import { agentDirectChatService } from "../services/agent-direct-chat.js";

export function agentDirectChatRoutes(db: Db) {
  const router = Router();
  const svc = agentDirectChatService(db);

  // 1. List sessions
  router.get("/companies/:companyId/agents/:agentId/chats", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);
    const sessions = await svc.listSessions(companyId, agentId);
    res.json(sessions);
  });

  // 2. Create session
  router.post(
    "/companies/:companyId/agents/:agentId/chats",
    validate(createAgentChatSessionSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const agentId = req.params.agentId as string;
      assertCompanyAccess(req, companyId);
      const userId = req.actor.userId ?? "board";
      const session = await svc.createSession(
        companyId,
        agentId,
        userId,
        req.body?.title,
      );
      res.status(201).json(session);
    },
  );

  // 3. List messages in session
  router.get(
    "/companies/:companyId/agents/:agentId/chats/:sessionId/messages",
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const sessionId = req.params.sessionId as string;
      assertCompanyAccess(req, companyId);
      const messages = await svc.listMessages(companyId, sessionId);
      res.json(messages);
    },
  );

  // 4. Send message & stream response (SSE)
  router.post(
    "/companies/:companyId/agents/:agentId/chats/:sessionId/messages",
    validate(sendAgentChatMessageSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const agentId = req.params.agentId as string;
      const sessionId = req.params.sessionId as string;
      assertCompanyAccess(req, companyId);

      const userId = req.actor.userId ?? "board";
      const content = req.body.content as string;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      try {
        const agentMessage = await svc.streamMessageResponse(
          companyId,
          agentId,
          sessionId,
          content,
          userId,
          (chunk) => {
            res.write(`event: token\ndata: ${JSON.stringify({ delta: chunk })}\n\n`);
          },
        );

        res.write(
          `event: done\ndata: ${JSON.stringify({
            messageId: agentMessage.id,
            content: agentMessage.content,
          })}\n\n`,
        );
      } catch (err) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            error: err instanceof Error ? err.message : "An error occurred while streaming the response",
          })}\n\n`,
        );
      } finally {
        res.end();
      }
    },
  );

  // 5. Promote message to Task
  router.post(
    "/companies/:companyId/agents/:agentId/chats/:sessionId/messages/:messageId/promote-to-task",
    validate(promoteChatToTaskSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const agentId = req.params.agentId as string;
      const sessionId = req.params.sessionId as string;
      const messageId = req.params.messageId as string;
      assertCompanyAccess(req, companyId);

      const userId = req.actor.userId ?? "board";
      const result = await svc.promoteToTask(
        companyId,
        agentId,
        sessionId,
        messageId,
        req.body,
        userId,
      );
      res.status(201).json(result);
    },
  );

  return router;
}
