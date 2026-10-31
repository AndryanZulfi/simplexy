import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Db } from "@simplexy/db";
import { forbidden } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { isCloudManagedInstance } from "./cloud-instance.js";

export const ALLOWED_MANAGED_LOCAL_ADAPTERS = ["pi_local", "hermes_local"];

let cachedModels: { data: Array<{ id: string; label: string }>; timestamp: number } | null = null;

export function resolveLocalWorkspaceGatewayUrl(): string {
  return (
    process.env.SIMPLEXY_LOCAL_GATEWAY_URL?.trim() ||
    (() => {
      try {
        const prov = JSON.parse(process.env.SIMPLEXY_LOCAL_PI_PROVIDERS || "{}");
        return prov?.simplexy?.baseUrl;
      } catch { return undefined; }
    })() ||
    "http://127.0.0.1:20128/v1"
  ).replace(/\/+$/, "");
}

export function resolveLocalWorkspaceGatewayApiKey(): string | undefined {
  return (
    process.env.SIMPLEXY_LOCAL_GATEWAY_API_KEY?.trim() ||
    process.env.HERMES_CUSTOM_LOCALHOST_20128_API_KEY?.trim() ||
    (() => {
      try {
        const prov = JSON.parse(process.env.SIMPLEXY_LOCAL_PI_PROVIDERS || "{}");
        return prov?.simplexy?.apiKey;
      } catch { return undefined; }
    })()
  );
}

export async function fetchLocalWorkspaceModels(): Promise<Array<{ id: string; label: string }>> {
  if (cachedModels && Date.now() - cachedModels.timestamp < 60_000) {
    return cachedModels.data;
  }
  const key = resolveLocalWorkspaceGatewayApiKey();
  const baseUrl = resolveLocalWorkspaceGatewayUrl();
  if (!key) return [];
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return cachedModels?.data ?? [];
    const body = (await res.json()) as { data?: Array<{ id: string }> };
    const list = (body.data ?? [])
      .map((m) => ({ id: m.id, label: m.id }))
      .filter((m) => m.id.startsWith("ag/") || m.id.startsWith("cx/"));
    cachedModels = { data: list, timestamp: Date.now() };
    return list;
  } catch {
    return cachedModels?.data ?? [];
  }
}

export function isLocalWorkspaceAgentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SIMPLEXY_LOCAL_AGENTS_ENABLED === "true" && !isCloudManagedInstance(env);
}

export function assertManagedLocalAgentConfiguration(companyId: string, data: { adapterType?: string; adapterConfig?: unknown }) {
  if (!isLocalWorkspaceAgentsEnabled()) return;
  const config = data.adapterConfig as Record<string, unknown> | null | undefined;
  if (!ALLOWED_MANAGED_LOCAL_ADAPTERS.includes(data.adapterType ?? "") || config?.managedLocalWorkspace !== true || config.companyId !== companyId) {
    throw forbidden("Managed local agents must use the company-bound managed runtime (Pi or Hermes)");
  }
}

export function resolveLocalWorkspacePiModel(): string {
  const model = process.env.SIMPLEXY_LOCAL_PI_MODEL?.trim();
  if (!model) throw new Error("Managed local workspace agents require SIMPLEXY_LOCAL_PI_MODEL to be configured");
  return model;
}

// Paths separate persisted state; execution isolation is enforced by the managed runtime, not cwd.
export function localWorkspaceAgentConfig(companyId: string, adapterType = "pi_local", modelOverride?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    throw new Error("Managed workspace requires a company UUID");
  }
  const root = path.join(resolvePaperclipInstanceRoot(), "local-workspaces", companyId);
  return {
    managedLocalWorkspace: true,
    companyId,
    model: modelOverride || resolveLocalWorkspacePiModel(),
    cwd: path.join(root, "workspace"),
    env: {
      HOME: path.join(root, "home"),
      PI_CODING_AGENT_DIR: path.join(root, "pi"),
      HERMES_HOME: path.join(root, "hermes"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_DATA_HOME: path.join(root, "data"),
    },
  };
}

export async function ensureLocalWorkspaceDirectories(companyId: string): Promise<string> {
  const root = path.join(resolvePaperclipInstanceRoot(), "local-workspaces", companyId);
  const dirs = ["workspace", "home", "pi", "hermes", "config", "cache", "data", "tmp", "sessions"];
  for (const name of dirs) {
    await fs.mkdir(path.join(root, name), { recursive: true, mode: 0o700 });
  }
  return root;
}

export async function provisionLocalWorkspaceAgent(db: Db, companyId: string, userId: string) {
  const { createAgentLifecycle } = await import("./agent-lifecycle.js");
  await ensureLocalWorkspaceDirectories(companyId);
  const adapterConfig = localWorkspaceAgentConfig(companyId);
  const bytes = createHash("sha256").update(`simplexy:local-workspace-agent:${companyId}`).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  const lifecycle = createAgentLifecycle(db);
  const existing = await lifecycle.get(id);
  if (existing) {
    if (existing.status === "paused") {
      await lifecycle.resumeAgent(id).catch(() => undefined);
      const resumed = await lifecycle.get(id);
      if (resumed && resumed.status !== "paused") return resumed;
    }
    return existing;
  }
  try {
    return await lifecycle.requestHire(companyId, {
      id,
      name: "Workspace Agent",
      role: "ceo",
      adapterType: "pi_local",
      runner: "legacy",
      adapterConfig,
      runtimeConfig: { heartbeat: { enabled: false } },
      permissions: { canCreateAgents: false },
    }, { createdByUserId: userId, responsibleUserId: userId });
  } catch (error) {
    // The deterministic primary key arbitrates concurrent provisioning attempts.
    const winner = await lifecycle.get(id);
    if (winner) return winner;
    throw error;
  }
}
