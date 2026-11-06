import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { agentDirectChatsApi } from "@/api/agentDirectChats";
import type { Agent, AgentChatMessage } from "@simplexy/shared";
import { PromoteChatToTaskModal } from "./PromoteChatToTaskModal";
import { Send, CheckSquare, Plus, Loader2 } from "lucide-react";

interface AgentChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  agent: Agent;
}

export function AgentChatDrawer({
  open,
  onOpenChange,
  companyId,
  agent,
}: AgentChatDrawerProps) {
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);
  const [selectedMessageForTask, setSelectedMessageForTask] = useState<AgentChatMessage | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStreamingContent("");
  }, [companyId, agent.id, selectedSessionId]);

  // 1. Fetch sessions
  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ["agent-chats", companyId, agent.id, "sessions"],
    queryFn: () => agentDirectChatsApi.listSessions(companyId, agent.id),
    enabled: open,
  });

  // Auto-select latest session or null
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      setSelectedSessionId(sessions[0]!.id);
    }
  }, [sessions, selectedSessionId]);

  // 2. Fetch messages in active session
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ["agent-chats", companyId, agent.id, "messages", selectedSessionId],
    queryFn: () =>
      selectedSessionId
        ? agentDirectChatsApi.listMessages(companyId, agent.id, selectedSessionId)
        : Promise.resolve([]),
    enabled: Boolean(selectedSessionId) && open,
  });

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // 3. Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: (title?: string) =>
      agentDirectChatsApi.createSession(companyId, agent.id, { title }),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({
        queryKey: ["agent-chats", companyId, agent.id, "sessions"],
      });
      setSelectedSessionId(newSession.id);
    },
  });

  // 4. Send Message & Stream
  async function handleSendMessage(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const content = inputText.trim();
    if (!content || isStreaming) return;

    let activeSessionId = selectedSessionId;
    if (!activeSessionId) {
      const newSession = await createSessionMutation.mutateAsync(
        content.slice(0, 30),
      );
      activeSessionId = newSession.id;
    }
    if (!activeSessionId) return;

    setInputText("");
    setIsStreaming(true);
    setStreamingContent("");

    // Optimistically show user message
    queryClient.setQueryData<AgentChatMessage[]>(
      ["agent-chats", companyId, agent.id, "messages", activeSessionId],
      (prev = []) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          companyId,
          sessionId: activeSessionId!,
          senderType: "user",
          senderId: "me",
          content,
          createdAt: new Date().toISOString(),
        },
      ],
    );

    await agentDirectChatsApi.streamMessage(
      companyId,
      agent.id,
      activeSessionId,
      content,
      (token) => {
        setStreamingContent((prev) => prev + token);
      },
      () => {
        setIsStreaming(false);
        setStreamingContent("");
        queryClient.invalidateQueries({
          queryKey: ["agent-chats", companyId, agent.id, "messages", activeSessionId],
        });
      },
      (err) => {
        setIsStreaming(false);
        setStreamingContent(`\n[Error: ${err}]`);
      },
    );
  }

  // 5. Promote message to Task
  const promoteMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description: string;
      priority: "low" | "medium" | "high" | "urgent";
    }) => {
      if (!selectedMessageForTask || !selectedSessionId) {
        throw new Error("No message selected");
      }
      return agentDirectChatsApi.promoteToTask(
        companyId,
        agent.id,
        selectedSessionId,
        selectedMessageForTask.id,
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["agent-chats", companyId, agent.id, "messages", selectedSessionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["issues", companyId],
      });
      setPromoteModalOpen(false);
      setSelectedMessageForTask(null);
    },
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex flex-col sm:max-w-md w-full p-0 gap-0 h-full border-l">
          {/* Header */}
          <SheetHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0">
            <div className="flex flex-col">
              <SheetTitle className="text-base font-semibold flex items-center gap-2">
                {agent.name}
                <Badge variant="outline" className="text-xs font-normal">
                  {agent.role}
                </Badge>
              </SheetTitle>
              <span className="text-xs text-muted-foreground">Direct chat</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => createSessionMutation.mutate("New conversation")}
              disabled={createSessionMutation.isPending || isStreaming}
            >
              <Plus className="h-4 w-4 mr-1" /> New chat
            </Button>
          </SheetHeader>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loadingSessions || (selectedSessionId && loadingMessages) ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading chat...
              </div>
            ) : messages.length === 0 && !isStreaming ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground text-sm space-y-2 p-6">
                <p className="font-medium text-foreground">Start chatting with {agent.name}</p>
                <p className="text-xs">
                  Ask questions, clarify instructions, or discuss ideas. Replies stream as they arrive.
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
                    className={`max-w-xs sm:max-w-md rounded-lg px-3 py-2 text-sm ${
                      msg.senderType === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground border"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Task Reference Card if message promoted to task */}
                    {msg.createdTaskId && (
                      <div className="mt-2 pt-2 border-t border-border/60 text-xs flex items-center justify-between gap-2">
                        <span className="font-medium flex items-center gap-1">
                          <CheckSquare className="h-3 w-3 text-primary" />
                          {msg.createdTaskIdentifier || "Task"}: {msg.createdTaskTitle || "View task"}
                        </span>
                        <Link
                          to={`/issues/${msg.createdTaskId}`}
                          className="underline underline-offset-2 hover:text-primary"
                        >
                          Open
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Promote to Task Action for Agent Messages */}
                  {msg.senderType === "agent" && !msg.createdTaskId && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-1"
                      onClick={() => {
                        setSelectedMessageForTask(msg);
                        setPromoteModalOpen(true);
                      }}
                    >
                      <CheckSquare className="h-3 w-3" /> Create task
                    </button>
                  )}
                </div>
              ))
            )}

            {/* Live Streaming Bubble */}
            {(isStreaming || streamingContent) && (
              <div className="flex flex-col items-start">
                <div className="max-w-xs sm:max-w-md rounded-lg px-3 py-2 text-sm bg-muted text-foreground border">
                  <p role={isStreaming ? "status" : "alert"} className="whitespace-pre-wrap">
                    {streamingContent || "Typing..."}
                  </p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <form
            onSubmit={handleSendMessage}
            className="p-3 border-t bg-background flex items-end gap-2"
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
              placeholder={`Message ${agent.name}...`}
              className="min-h-11 max-h-32 resize-none text-sm"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isStreaming || !inputText.trim()}
              className="h-10 w-10 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Promote to Task Modal */}
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
    </>
  );
}
