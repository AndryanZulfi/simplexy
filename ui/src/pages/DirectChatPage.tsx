import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AgentAvatar } from "@/components/AgentAvatar";
import { agentDirectChatsApi } from "@/api/agentDirectChats";
import { agentsApi } from "@/api/agents";
import { useCompany } from "@/context/CompanyContext";
import { queryKeys } from "@/lib/queryKeys";
import type { Agent, AgentChatMessage } from "@simplexy/shared";
import { PromoteChatToTaskModal } from "@/components/PromoteChatToTaskModal";
import { Send, CheckSquare, Plus, Loader2, MessageSquare } from "lucide-react";

export function DirectChatPage() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);
  const [selectedMessageForTask, setSelectedMessageForTask] = useState<AgentChatMessage | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStreamingContent("");
  }, [selectedCompanyId, selectedAgentId, selectedSessionId]);

  // 1. Fetch available agents in the company
  const { data: agents = [], isLoading: loadingAgents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? ""),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const availableAgents = agents.filter(
    (a) => a.status !== "terminated" && a.status !== "pending_approval",
  );

  // Auto-select first active agent
  useEffect(() => {
    if (availableAgents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(availableAgents[0]!.id);
    }
  }, [availableAgents, selectedAgentId]);

  const currentAgent = availableAgents.find((a) => a.id === selectedAgentId) ?? null;

  // 2. Fetch sessions for the selected agent
  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ["agent-chats", selectedCompanyId, selectedAgentId, "sessions"],
    queryFn: () =>
      selectedCompanyId && selectedAgentId
        ? agentDirectChatsApi.listSessions(selectedCompanyId, selectedAgentId)
        : Promise.resolve([]),
    enabled: Boolean(selectedCompanyId && selectedAgentId),
  });

  // Auto-select latest session
  useEffect(() => {
    if (sessions.length > 0) {
      setSelectedSessionId(sessions[0]!.id);
    } else {
      setSelectedSessionId(null);
    }
  }, [sessions, selectedAgentId]);

  // 3. Fetch messages in active session
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ["agent-chats", selectedCompanyId, selectedAgentId, "messages", selectedSessionId],
    queryFn: () =>
      selectedCompanyId && selectedAgentId && selectedSessionId
        ? agentDirectChatsApi.listMessages(selectedCompanyId, selectedAgentId, selectedSessionId)
        : Promise.resolve([]),
    enabled: Boolean(selectedCompanyId && selectedAgentId && selectedSessionId),
  });

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // 4. Create new session mutation
  const createSessionMutation = useMutation({
    mutationFn: (title?: string) => {
      if (!selectedCompanyId || !selectedAgentId) throw new Error("No agent selected");
      return agentDirectChatsApi.createSession(selectedCompanyId, selectedAgentId, { title });
    },
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({
        queryKey: ["agent-chats", selectedCompanyId, selectedAgentId, "sessions"],
      });
      setSelectedSessionId(newSession.id);
    },
  });

  // 5. Send message and stream
  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const content = inputText.trim();
    if (!content || isStreaming || !selectedCompanyId || !selectedAgentId) return;

    let activeSessionId = selectedSessionId;
    if (!activeSessionId) {
      const newSession = await createSessionMutation.mutateAsync(content.slice(0, 30));
      activeSessionId = newSession.id;
    }
    if (!activeSessionId) return;

    setInputText("");
    setIsStreaming(true);
    setStreamingContent("");

    // Optimistically show user message
    queryClient.setQueryData<AgentChatMessage[]>(
      ["agent-chats", selectedCompanyId, selectedAgentId, "messages", activeSessionId],
      (prev = []) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          companyId: selectedCompanyId,
          sessionId: activeSessionId!,
          senderType: "user",
          senderId: "me",
          content,
          createdAt: new Date().toISOString(),
        },
      ],
    );

    await agentDirectChatsApi.streamMessage(
      selectedCompanyId,
      selectedAgentId,
      activeSessionId,
      content,
      (token) => {
        setStreamingContent((prev) => prev + token);
      },
      () => {
        setIsStreaming(false);
        setStreamingContent("");
        queryClient.invalidateQueries({
          queryKey: ["agent-chats", selectedCompanyId, selectedAgentId, "messages", activeSessionId],
        });
      },
      (err) => {
        setIsStreaming(false);
        setStreamingContent(`\n[Error: ${err}]`);
      },
    );
  }

  // 6. Promote message to Task
  const promoteMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      priority: "low" | "medium" | "high" | "urgent";
    }) => {
      if (!selectedMessageForTask || !selectedSessionId || !selectedCompanyId || !selectedAgentId) {
        throw new Error("No message selected");
      }
      return agentDirectChatsApi.promoteToTask(
        selectedCompanyId,
        selectedAgentId,
        selectedSessionId,
        selectedMessageForTask.id,
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent-chats", selectedCompanyId, selectedAgentId, "messages", selectedSessionId],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.all,
      });
      setPromoteModalOpen(false);
      setSelectedMessageForTask(null);
    },
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden border border-border rounded-lg bg-background">
      {/* Kolom Kiri: Pemilihan Agent & Sesi Chat */}
      <div className="w-64 border-r border-border flex flex-col bg-muted/20">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="size-4" /> Agent Chat
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2"
            onClick={() => createSessionMutation.mutate("New conversation")}
            disabled={createSessionMutation.isPending || !selectedAgentId || isStreaming}
          >
            <Plus className="size-3 mr-1" /> New
          </Button>
        </div>

        {/* Daftar Agent */}
        <div className="p-2 border-b border-border">
          <label className="text-xs text-muted-foreground px-2 pb-1 block">Select agent</label>
          <div className="space-y-1">
            {loadingAgents ? (
              <p className="text-xs text-muted-foreground p-2">Loading agents...</p>
            ) : availableAgents.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No active agents</p>
            ) : (
              availableAgents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAgentId(a.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium text-left transition-colors ${
                    a.id === selectedAgentId
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <AgentAvatar agent={a} size={16} />
                  <span className="truncate">{a.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Daftar Sesi Obrolan */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <label className="text-xs text-muted-foreground px-2 pb-1 block">Session history</label>
          {loadingSessions ? (
            <p className="text-xs text-muted-foreground p-2">Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No conversations yet</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSessionId(s.id)}
                className={`w-full px-2.5 py-1.5 rounded-md text-xs text-left truncate transition-colors block ${
                  s.id === selectedSessionId
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.title}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Kolom Kanan: Area Percakapan Interaktif */}
      <div className="flex-1 flex flex-col h-full bg-background min-w-0">
        {/* Header Obrolan */}
        <div className="p-3 border-b border-border flex items-center justify-between bg-card">
          {currentAgent ? (
            <div className="flex items-center gap-2 min-w-0">
              <AgentAvatar agent={currentAgent} size={24} />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold truncate flex items-center gap-2">
                  {currentAgent.name}
                  <Badge variant="outline" className="text-xs font-normal">
                    {currentAgent.role}
                  </Badge>
                </h2>
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Select an agent to start chatting</span>
          )}
        </div>

        {/* Area Pesan */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!currentAgent ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select an agent on the left to start chatting
            </div>
          ) : loadingMessages ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading messages...
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground text-sm space-y-2 p-6">
              <MessageSquare className="size-8 text-muted-foreground/50 mb-2" />
              <p className="font-medium text-foreground">Chat directly with {currentAgent.name}</p>
              <p className="text-xs max-w-sm">
                Ask questions, clarify instructions, or get technical advice. Replies stream directly without entering the task queue.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.senderType === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-xs sm:max-w-xl rounded-lg px-3.5 py-2.5 text-sm ${
                    msg.senderType === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground border"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Task Reference Card */}
                  {msg.createdTaskId && (
                    <div className="mt-2 pt-2 border-t border-border/60 text-xs flex items-center justify-between gap-2">
                      <span className="font-medium flex items-center gap-1">
                        <CheckSquare className="size-3 text-primary" />
                        {msg.createdTaskIdentifier || "Task"}: {msg.createdTaskTitle || "View task"}
                      </span>
                      <Link
                        to={`/issues/${msg.createdTaskId}`}
                        className="underline underline-offset-2 hover:text-primary"
                      >
                        Open task
                      </Link>
                    </div>
                  )}
                </div>

                {/* Promote to Task Action */}
                {msg.senderType === "agent" && !msg.createdTaskId && (
                  <button
                    type="button"
                    className="mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-1"
                    onClick={() => {
                      setSelectedMessageForTask(msg);
                      setPromoteModalOpen(true);
                    }}
                  >
                    <CheckSquare className="size-3" /> Create task
                  </button>
                )}
              </div>
            ))
          )}

          {/* Streaming Bubble */}
          {(isStreaming || streamingContent) && (
            <div className="flex flex-col items-start">
              <div className="max-w-xs sm:max-w-xl rounded-lg px-3.5 py-2.5 text-sm bg-muted text-foreground border">
                <p role={isStreaming ? "status" : "alert"} className="whitespace-pre-wrap">
                  {streamingContent || "Typing..."}
                </p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Text Form */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 border-t bg-card flex items-end gap-2"
        >
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={
              currentAgent
                ? `Message ${currentAgent.name}... (Enter to send, Shift+Enter for a new line)`
                : "Select an agent first..."
            }
            disabled={!currentAgent || isStreaming}
            className="min-h-11 max-h-32 resize-none text-sm"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!currentAgent || isStreaming || !inputText.trim()}
            className="h-10 w-10 shrink-0"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>

      {/* Modal Promote To Task */}
      {selectedMessageForTask && (
        <PromoteChatToTaskModal
          open={promoteModalOpen}
          onOpenChange={setPromoteModalOpen}
          initialContent={selectedMessageForTask.content}
          loading={promoteMutation.isPending}
          onConfirm={async (data) => {
            await promoteMutation.mutateAsync(data);
          }}
        />
      )}
    </div>
  );
}
