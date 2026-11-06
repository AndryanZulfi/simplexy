// @vitest-environment jsdom

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@simplexy/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectChatPage } from "../pages/DirectChatPage";
import { AgentChatDrawer } from "../components/AgentChatDrawer";
import { queryKeys } from "../lib/queryKeys";

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));
vi.mock("../components/AgentAvatar", () => ({ AgentAvatar: () => null }));
vi.mock("../components/PromoteChatToTaskModal", () => ({ PromoteChatToTaskModal: () => null }));
vi.mock("../components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const agent = { id: "agent-1", name: "Alex", role: "engineer", status: "active" } as Agent;
let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  queryClient.setQueryData(queryKeys.agents.list("company-1"), [agent]);
  queryClient.setQueryData(["agent-chats", "company-1", "agent-1", "sessions"], [
    { id: "session-1", title: "Test conversation" },
  ]);
  queryClient.setQueryData(["agent-chats", "company-1", "agent-1", "messages", "session-1"], []);
  const encoder = new TextEncoder();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("event: error\n"));
      controller.enqueue(encoder.encode('data: {"error":"Gateway unavailable"}\n\n'));
      controller.close();
    },
  }))));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("direct chat gateway failures", () => {
  it.each([
    ["DirectChatPage", "session"],
    ["AgentChatDrawer", "session"],
    ["DirectChatPage", "agent"],
    ["AgentChatDrawer", "agent"],
  ])("remain visible in %s until the selected %s changes", async (surface, selection) => {
    const otherAgent = { ...agent, id: "agent-2", name: "Sam" };
    queryClient.setQueryData(queryKeys.agents.list("company-1"), [agent, otherAgent]);
    queryClient.setQueryData(["agent-chats", "company-1", "agent-2", "sessions"], [
      { id: "session-1", title: "Other agent conversation" },
    ]);
    queryClient.setQueryData(["agent-chats", "company-1", "agent-2", "messages", "session-1"], []);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          {surface === "DirectChatPage"
            ? <DirectChatPage />
            : <AgentChatDrawer open onOpenChange={() => {}} companyId="company-1" agent={agent} />}
        </QueryClientProvider>,
      );
    });
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Hello");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Gateway unavailable");
    expect(textarea.disabled).toBe(false);
    expect(container.querySelector('[role="status"]')).toBeNull();

    queryClient.setQueryData(["agent-chats", "company-1", "agent-1", "messages", "session-2"], []);
    if (selection === "agent") {
      await act(async () => {
        if (surface === "DirectChatPage") {
          Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Sam")!.click();
        } else {
          root.render(
            <QueryClientProvider client={queryClient}>
              <AgentChatDrawer open onOpenChange={() => {}} companyId="company-1" agent={otherAgent} />
            </QueryClientProvider>,
          );
        }
      });
    } else if (surface === "DirectChatPage") {
      await act(async () => {
        queryClient.setQueryData(["agent-chats", "company-1", "agent-1", "sessions"], [
          { id: "session-2", title: "Another conversation" },
        ]);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    } else {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: "session-2" }), {
        headers: { "Content-Type": "application/json" },
      }));
      await act(async () => {
        Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("New chat"))!.click();
      });
    }
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
