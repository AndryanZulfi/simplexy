import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
  create: vi.fn(), membership: vi.fn(), grants: vi.fn(), log: vi.fn(), hire: vi.fn(), get: vi.fn(), runner: vi.fn(),
}));
vi.mock("../services/index.js", () => ({
  companyService: () => ({ create: services.create }),
  accessService: () => ({ getMembership: services.membership, ensureMembership: services.membership, ensureRoleDefaultGrants: services.grants }),
  agentService: () => ({}), budgetService: () => ({}), heartbeatService: () => ({}),
  companyPortabilityService: () => ({}), companyArtifactsService: () => ({}),
  feedbackService: () => ({}), workTimelineService: () => ({}), logActivity: services.log,
}));
vi.mock("../services/companies.js", () => ({ companyService: () => ({ create: services.create }) }));
vi.mock("../services/access.js", () => ({ accessService: () => ({ getMembership: services.membership, ensureMembership: services.membership, ensureRoleDefaultGrants: services.grants }) }));
vi.mock("../services/agent-lifecycle.js", () => ({ createAgentLifecycle: () => ({ requestHire: services.hire, get: services.get }) }));
vi.mock("../services/activity-log.js", () => ({ logActivity: services.log }));
vi.mock("../services/secrets.js", () => ({ secretService: vi.fn(), assertClaudeOAuthBindingInvariant: vi.fn() }));
vi.mock("../services/agent-credentials.js", () => ({ agentCredentialService: vi.fn() }));
vi.mock("../services/agent-identity.js", () => ({ agentIdentityService: vi.fn() }));
vi.mock("../services/primary-agent.js", () => ({ initializePrimaryAgent: vi.fn(), clearPrimaryAgent: vi.fn() }));
vi.mock("../services/agent-runner-selection.js", () => ({ resolveNewAgentRunnerForCompany: services.runner, resolveAgentRunnerTaskDriverForCompany: vi.fn() }));
vi.mock("../services/budgets.js", () => ({ budgetServiceInTransaction: vi.fn() }));

async function app(actor: Record<string, unknown>) {
  const { companyRoutes } = await import("../routes/companies.js");
  const { errorHandler } = await import("../middleware/index.js");
  const db = { transaction: async (fn: (tx: unknown) => unknown) => fn(db) };
  const result = express();
  result.use(express.json());
  result.use((req, _res, next) => { (req as any).actor = actor; next(); });
  result.use("/api/companies", companyRoutes(db as any));
  result.use(errorHandler);
  return result;
}
const actor = { type: "board", source: "session", userId: "new-user", isInstanceAdmin: false, companyIds: [] };

describe("local workspace onboarding", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SIMPLEXY_LOCAL_AGENTS_ENABLED", "true");
    vi.stubEnv("SIMPLEXY_LOCAL_PI_MODEL", "simplexy/ag/gemini-3.8-flash");
    delete process.env.PAPERCLIP_MANAGED_CONFIG;
    delete process.env.PAPERCLIP_CLOUD_TENANT_SERVER_TOKEN;
    services.create.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", name: "Workspace", budgetMonthlyCents: 0 });
    services.hire.mockResolvedValue({ id: "agent-1" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([undefined, "false", "TRUE", "1"])("preserves admin-only creation when opt-in is %s", async (value) => {
    vi.stubEnv("SIMPLEXY_LOCAL_AGENTS_ENABLED", value);
    const res = await request(await app(actor)).post("/api/companies").send({ name: "Workspace" });
    expect(res.status).toBe(403);
    expect(services.create).not.toHaveBeenCalled();
    expect(services.hire).not.toHaveBeenCalled();
  });

  it.each(["PAPERCLIP_CLOUD_TENANT_SERVER_TOKEN", "PAPERCLIP_MANAGED_CONFIG"])("preserves Cloud floor with %s even when enabled", async (key) => {
    vi.stubEnv(key, "managed");
    const res = await request(await app(actor)).post("/api/companies").send({ name: "Workspace" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("cloud_managed");
    expect(services.create).not.toHaveBeenCalled();
  });

  it.each([
    { type: "none" },
    { type: "agent", companyId: "other-company" },
    { ...actor, userId: undefined },
    { ...actor, source: "board_key" },
  ])("does not grant self-service authority to $type / $source", async (untrusted) => {
    const res = await request(await app(untrusted)).post("/api/companies").send({ name: "Workspace" });
    expect(res.status).toBe(403);
    expect(services.create).not.toHaveBeenCalled();
  });

  it("reuses the existing default agent when provisioning is retried", async () => {
    const { provisionLocalWorkspaceAgent } = await import("../services/local-workspace-agents.js");
    services.get.mockResolvedValueOnce({ id: "existing-agent" });
    await expect(provisionLocalWorkspaceAgent({} as any, "11111111-1111-4111-8111-111111111111", "new-user")).resolves.toEqual({ id: "existing-agent" });
    expect(services.hire).not.toHaveBeenCalled();
  });

  it("recovers the winning agent after a concurrent provisioning conflict", async () => {
    const { provisionLocalWorkspaceAgent } = await import("../services/local-workspace-agents.js");
    services.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "winner" });
    services.hire.mockRejectedValueOnce(new Error("unique primary key"));
    await expect(provisionLocalWorkspaceAgent({} as any, "11111111-1111-4111-8111-111111111111", "new-user")).resolves.toEqual({ id: "winner" });
  });

  it("returns the persisted company with a recoverable provisioning failure", async () => {
    services.hire.mockRejectedValueOnce(new Error("provision failed"));
    const res = await request(await app(actor)).post("/api/companies").send({ name: "Workspace" });
    expect(res.status).toBe(201);
    expect(res.body.localAgentProvisioning).toEqual({ status: "failed" });
    expect(res.body.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it.each(["owner", "admin"])("allows an active company %s to retry provisioning without creating another company", async (membershipRole) => {
    services.membership.mockResolvedValue({ membershipRole, status: "active" });
    const res = await request(await app({ ...actor, companyIds: ["11111111-1111-4111-8111-111111111111"] }))
      .post("/api/companies/11111111-1111-4111-8111-111111111111/local-agent").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "agent-1" });
    expect(services.create).not.toHaveBeenCalled();
    expect(services.log).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "company.local_agent_provisioning_retried", actorId: "new-user", entityId: "11111111-1111-4111-8111-111111111111",
    }));
  });

  it("returns a retryable error without disclosing provisioning failures", async () => {
    services.membership.mockResolvedValue({ membershipRole: "owner", status: "active" });
    services.hire.mockRejectedValueOnce(new Error("secret operator runtime detail"));
    const res = await request(await app({ ...actor, companyIds: ["11111111-1111-4111-8111-111111111111"] }))
      .post("/api/companies/11111111-1111-4111-8111-111111111111/local-agent").send({});
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Local workspace agent provisioning failed. Please retry." });
    expect(services.log).toHaveBeenCalledTimes(1);
  });

  it.each([null, { membershipRole: "owner", status: "suspended" }, { role: "owner", status: "active" }])("denies retry without an active schema-backed owner/admin membership", async (membership) => {
    services.membership.mockResolvedValue(membership);
    const res = await request(await app({ ...actor, companyIds: ["11111111-1111-4111-8111-111111111111"] }))
      .post("/api/companies/11111111-1111-4111-8111-111111111111/local-agent").send({});
    expect(res.status).toBe(403);
    expect(services.hire).not.toHaveBeenCalled();
    expect(services.log).not.toHaveBeenCalled();
  });

  it.each(["member", "viewer"])("denies provisioning retry to %s", async (role) => {
    services.membership.mockResolvedValue({ membershipRole: role, status: "active" });
    const res = await request(await app({ ...actor, companyIds: ["11111111-1111-4111-8111-111111111111"] }))
      .post("/api/companies/11111111-1111-4111-8111-111111111111/local-agent").send({});
    expect(res.status).toBe(403);
    expect(services.hire).not.toHaveBeenCalled();
  });

  it("denies provisioning retry outside company scope", async () => {
    const res = await request(await app(actor)).post("/api/companies/11111111-1111-4111-8111-111111111111/local-agent").send({});
    expect(res.status).toBe(403);
    expect(services.hire).not.toHaveBeenCalled();
  });

  it("denies provisioning retry when mode is disabled", async () => {
    vi.stubEnv("SIMPLEXY_LOCAL_AGENTS_ENABLED", "false");
    const res = await request(await app({ ...actor, companyIds: ["11111111-1111-4111-8111-111111111111"] }))
      .post("/api/companies/11111111-1111-4111-8111-111111111111/local-agent").send({});
    expect(res.status).toBe(403);
    expect(services.hire).not.toHaveBeenCalled();
  });

  it("rejects managed execution bypasses at hire and configuration hooks", async () => {
    const { prepareAgentHire, prepareAgentHireApproval } = await import("../services/agent-hiring.js");
    const { prepareAgentConfiguration } = await import("../services/agent-configuration.js");
    const existing = { id: "agent", companyId: "11111111-1111-4111-8111-111111111111", adapterType: "pi_local", adapterConfig: { managedLocalWorkspace: true, companyId: "11111111-1111-4111-8111-111111111111" } };
    await expect(prepareAgentHire({} as any, existing.companyId, { name: "bypass", adapterType: "process" } as any)).rejects.toThrow("Managed local");
    for (const patch of [{ adapterType: "process" }, { adapterConfig: {} }, { adapterConfig: { managedLocalWorkspace: false } }, { adapterConfig: { managedLocalWorkspace: true, companyId: "22222222-2222-4222-8222-222222222222" } }]) {
      await expect(prepareAgentConfiguration({} as any, existing as any, patch)).rejects.toThrow("Managed local");
      await expect(prepareAgentHireApproval({} as any, existing as any, patch)).rejects.toThrow("Managed local");
    }
  });

  it.each([undefined, "", "   "])("fails closed without an operator PI model (%s)", async (model) => {
    vi.stubEnv("SIMPLEXY_LOCAL_PI_MODEL", model);
    const { localWorkspaceAgentConfig, provisionLocalWorkspaceAgent } = await import("../services/local-workspace-agents.js");
    expect(() => localWorkspaceAgentConfig("11111111-1111-4111-8111-111111111111")).toThrow("SIMPLEXY_LOCAL_PI_MODEL");
    await expect(provisionLocalWorkspaceAgent({} as any, "11111111-1111-4111-8111-111111111111", "new-user")).rejects.toThrow("SIMPLEXY_LOCAL_PI_MODEL");
    expect(services.hire).not.toHaveBeenCalled();
  });

  it("rejects runner selection that rewrites a managed hire to another adapter", async () => {
    const { prepareAgentHire } = await import("../services/agent-hiring.js");
    const companyId = "11111111-1111-4111-8111-111111111111";
    services.runner.mockResolvedValue({ adapterType: "paperclip_runner", adapterConfig: { managedLocalWorkspace: true, companyId } });
    await expect(prepareAgentHire({} as any, companyId, {
      name: "managed", adapterType: "pi_local", adapterConfig: { managedLocalWorkspace: true, companyId },
    } as any)).rejects.toThrow("Managed local");
  });

  it("permits non-execution configuration and approval changes on managed agents", async () => {
    const { prepareAgentConfiguration } = await import("../services/agent-configuration.js");
    const { prepareAgentHireApproval } = await import("../services/agent-hiring.js");
    const companyId = "11111111-1111-4111-8111-111111111111";
    const existing = { id: "agent", companyId, adapterType: "pi_local", adapterConfig: { managedLocalWorkspace: true, companyId } };
    await expect(prepareAgentConfiguration({} as any, existing as any, { title: "Updated" })).resolves.toEqual({ title: "Updated" });
    await expect(prepareAgentHireApproval({} as any, existing as any, {})).resolves.toEqual({});
  });

  it("does not impose managed configuration guards when disabled or cloud-managed", async () => {
    const { assertManagedLocalAgentConfiguration } = await import("../services/local-workspace-agents.js");
    vi.stubEnv("SIMPLEXY_LOCAL_AGENTS_ENABLED", "false");
    expect(() => assertManagedLocalAgentConfiguration("company", { adapterType: "process" })).not.toThrow();
    vi.stubEnv("SIMPLEXY_LOCAL_AGENTS_ENABLED", "true");
    vi.stubEnv("PAPERCLIP_MANAGED_CONFIG", "managed");
    expect(() => assertManagedLocalAgentConfiguration("company", { adapterType: "process" })).not.toThrow();
  });

  it("binds managed paths to company UUIDs without copying operator secrets", async () => {
    const { localWorkspaceAgentConfig, isLocalWorkspaceAgentsEnabled } = await import("../services/local-workspace-agents.js");
    vi.stubEnv("ANTHROPIC_API_KEY", "operator-secret-not-for-database");
    const config = localWorkspaceAgentConfig("11111111-1111-4111-8111-111111111111");
    expect(config.cwd).toContain("/local-workspaces/11111111-1111-4111-8111-111111111111/workspace");
    expect(Object.keys(config.env).sort()).toEqual(["HERMES_HOME", "HOME", "PI_CODING_AGENT_DIR", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME"]);
    expect(JSON.stringify(config)).not.toContain("operator-secret");
    expect(localWorkspaceAgentConfig("22222222-2222-4222-8222-222222222222").env.HOME).not.toBe(config.env.HOME);
    expect(() => localWorkspaceAgentConfig("../escape")).toThrow("company UUID");
    expect(isLocalWorkspaceAgentsEnabled()).toBe(true);
  });

  it("lets a new session user create an owned workspace and exactly one managed PI agent", async () => {
    const res = await request(await app(actor)).post("/api/companies").send({ name: "Workspace", defaultResponsibleUserId: "other-user" });
    expect(res.status).toBe(201);
    expect(services.create).toHaveBeenCalledWith(expect.objectContaining({ defaultResponsibleUserId: "new-user" }));
    expect(services.membership).toHaveBeenCalledWith(res.body.id, "user", "new-user", "owner", "active");
    expect(services.hire).toHaveBeenCalledTimes(1);
    expect(services.hire).toHaveBeenCalledWith(res.body.id, expect.objectContaining({
      adapterType: "pi_local", adapterConfig: expect.objectContaining({ managedLocalWorkspace: true, companyId: res.body.id, model: "simplexy/ag/gemini-3.8-flash" }),
    }), expect.anything());
    expect(actor.isInstanceAdmin).toBe(false);
  });
});
