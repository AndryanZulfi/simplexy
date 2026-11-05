import { z } from "zod";

export const createAgentChatSessionSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
});

export const sendAgentChatMessageSchema = z.object({
  content: z.string().trim().min(1, "Pesan tidak boleh kosong"),
});

export const promoteChatToTaskSchema = z.object({
  title: z.string().trim().min(1, "Judul tugas wajib diisi").max(255),
  description: z.string().trim().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
});
