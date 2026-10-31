import { randomBytes, randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type APIResponse, type PlaywrightWorkerArgs } from "@playwright/test";

// Run only against a disposable, already bootstrapped authenticated instance with public signup.
// Server: SIMPLEXY_LOCAL_AGENTS_ENABLED=true. Live additionally needs configured real PI credentials/runtime.
// PAPERCLIP_E2E_BASE_URL=http://127.0.0.1:<port> pnpm exec playwright test --config tests/e2e/playwright-local-workspace-agents.config.ts
const baseURL = process.env.PAPERCLIP_E2E_BASE_URL;
const live = process.env.SIMPLEXY_E2E_LIVE_PI === "true";
test.skip(!baseURL, "Set PAPERCLIP_E2E_BASE_URL to a disposable authenticated instance");

type Company = { id: string; name: string };
type Agent = {
  id: string;
  companyId: string;
  adapterType: string;
  adapterConfig: { managedLocalWorkspace?: boolean; companyId?: string; cwd?: string; env?: Record<string, string> };
};

async function json<T>(response: APIResponse): Promise<T> {
  // Do not print signup/session bodies: they may contain auth tokens.
  expect(response.ok(), `${new URL(response.url()).pathname}: ${response.status()}`).toBe(true);
  return response.json();
}

async function account(playwright: PlaywrightWorkerArgs["playwright"]) {
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  try {
    const health = await json<{ deploymentMode: string; localWorkspaceAgentsEnabled?: boolean }>(await api.get("/api/health"));
    expect(health.deploymentMode).toBe("authenticated");
    expect(health.localWorkspaceAgentsEnabled, "Enable SIMPLEXY_LOCAL_AGENTS_ENABLED=true on the server").toBe(true);
    const signup = await api.post("/api/auth/sign-up/email", {
      data: { name: "Local workspace E2E", email: `${randomUUID()}@example.test`, password: randomBytes(24).toString("base64url") },
    });
    expect(signup.ok(), `Signup status: ${signup.status()}`).toBe(true);
    await json(await api.get("/api/auth/get-session"));
    // An unclaimed instance or local_implicit actor must not accidentally turn this into an admin test.
    expect((await api.get("/api/admin/users")).status()).toBe(403);
    const company = await json<Company>(await api.post("/api/companies", { data: { name: `Local E2E ${randomUUID()}` } }));
    expect(await json<Company>(await api.get(`/api/companies/${company.id}`))).toMatchObject(company);
    const agents = await json<Agent[]>(await api.get(`/api/companies/${company.id}/agents`));
    const managed = agents.filter((agent) => agent.adapterConfig.managedLocalWorkspace === true);
    expect(managed).toHaveLength(1);
    const agent = managed[0]!;
    expect(agent).toMatchObject({ companyId: company.id, adapterType: "pi_local", adapterConfig: { companyId: company.id } });
    expect(await json<Agent>(await api.get(`/api/agents/${agent.id}`))).toMatchObject({ id: agent.id, adapterType: "pi_local" });
    return { api, company, agent };
  } catch (error) {
    await api.dispose();
    throw error;
  }
}

async function denied(api: APIRequestContext, path: string, method: "GET" | "POST" = "GET", data?: unknown) {
  const response = await api.fetch(path, { method, data });
  expect([403, 404], `${method} ${path}: ${response.status()}`).toContain(response.status());
}

test("two non-admin accounts self-onboard managed PI agents without cross-workspace access", async ({ playwright }) => {
  const a = await account(playwright);
  try {
    const b = await account(playwright);
    const anonymous = await playwright.request.newContext({ baseURL });
    try {
      expect((await anonymous.post("/api/companies", { data: { name: "Unauthenticated workspace" } })).status()).toBe(401);
      expect(a.company.id).not.toBe(b.company.id);
      expect(a.agent.id).not.toBe(b.agent.id);
      for (const [owner, other] of [[a, b], [b, a]]) {
        const companies = await json<Company[]>(await owner.api.get("/api/companies"));
        expect(companies.map((company) => company.id)).toContain(owner.company.id);
        expect(companies.map((company) => company.id)).not.toContain(other.company.id);
        await denied(owner.api, `/api/companies/${other.company.id}`);
        await denied(owner.api, `/api/companies/${other.company.id}/agents`);
        await denied(owner.api, `/api/agents/${other.agent.id}`);
        await denied(owner.api, `/api/agents/${other.agent.id}/wakeup`, "POST", { source: "on_demand", triggerDetail: "manual" });
        await denied(owner.api, `/api/companies/${other.company.id}/issues`, "POST", { title: "Forbidden task" });
        await denied(owner.api, `/api/companies/${other.company.id}/chats/${other.agent.id}`, "POST", {});

        // Use the same conversation/comment contract as ui/src/api/agentChats.ts and issues.ts.
        const chat = await json<{ id: string; companyId: string; assigneeAgentId: string }>(
          await owner.api.post(`/api/companies/${owner.company.id}/chats/${owner.agent.id}`, { data: {} }),
        );
        expect(chat).toMatchObject({ companyId: owner.company.id, assigneeAgentId: owner.agent.id });
        await denied(other.api, `/api/issues/${chat.id}`);
        await denied(other.api, `/api/issues/${chat.id}/comments`);
        await denied(other.api, `/api/issues/${chat.id}/comments`, "POST", { body: "Forbidden message" });
      }
      const aConfig = a.agent.adapterConfig;
      const bConfig = b.agent.adapterConfig;
      expect(aConfig.cwd).toEqual(expect.stringContaining(a.company.id));
      expect(bConfig.cwd).toEqual(expect.stringContaining(b.company.id));
      expect(aConfig.cwd).not.toBe(bConfig.cwd);
      for (const key of ["HOME", "PI_CODING_AGENT_DIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"]) {
        expect(aConfig.env?.[key]).toEqual(expect.stringContaining(a.company.id));
        expect(bConfig.env?.[key]).toEqual(expect.stringContaining(b.company.id));
        expect(aConfig.env?.[key]).not.toBe(bConfig.env?.[key]);
      }
    } finally {
      await Promise.all([b.api.dispose(), anonymous.dispose()]);
    }
  } finally {
    await a.api.dispose();
  }
});

test("live PI executes a workspace task and publishes a real agent-authored result", async ({ playwright }, info) => {
  test.skip(!live, "Set SIMPLEXY_E2E_LIVE_PI=true only with a real configured PI provider; no provider is mocked");
  const owner = await account(playwright);
  try {
    const marker = `LIVE_PI_${randomUUID()}`;
    const issue = await json<{ id: string }>(await owner.api.post(`/api/companies/${owner.company.id}/issues`, {
      data: {
        title: "Live managed PI workspace proof",
        description: `Use a local shell tool to run printf '%s' '${marker}'. Publish the command output as a comment on this task, then mark the task done. Do not merely describe what you would do.`,
        status: "todo",
        assigneeAgentId: owner.agent.id,
      },
    }));
    // Issue creation wakes its assignee through the real task API; never mint an agent result in the test.
    await expect.poll(async () => {
      const comments = await json<Array<{ authorAgentId: string | null; body: string }>>(
        await owner.api.get(`/api/issues/${issue.id}/comments`),
      );
      return comments.some((comment) => comment.authorAgentId === owner.agent.id && comment.body.includes(marker));
    }, { timeout: 150_000, intervals: [1_000, 2_000, 5_000] }).toBe(true);
    await expect.poll(async () => (await json<{ status: string }>(await owner.api.get(`/api/issues/${issue.id}`))).status).toBe("done");
    const runs = await json<Array<{ id: string; agentId: string; status: string }>>(await owner.api.get(`/api/issues/${issue.id}/runs`));
    expect(runs).toEqual(expect.arrayContaining([expect.objectContaining({ agentId: owner.agent.id, status: "succeeded" })]));
    await info.attach("live-pi-evidence", {
      body: JSON.stringify({ companyId: owner.company.id, agentId: owner.agent.id, issueId: issue.id, marker, succeededRunIds: runs.filter((run) => run.status === "succeeded").map((run) => run.id) }),
      contentType: "application/json",
    });
  } finally {
    await owner.api.dispose();
  }
});
