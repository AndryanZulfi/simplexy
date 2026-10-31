import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@simplexy/adapter-utils";
import { runChildProcess, runningProcesses, signalRunningProcess, joinPromptSections, selectPaperclipPromptSections } from "@simplexy/adapter-utils/server-utils";
import { prepareManagedLocalRuntime } from "./managed-local.js";
import { parsePiJsonl } from "./parse.js";

// Only the host broker sees operator credentials; its child receives a revocable per-run capability.
export async function startManagedInferenceProxy(model: string, providersJson: string) {
  const separator = model.indexOf("/");
  if (separator < 1 || separator === model.length - 1) throw new Error("Managed model must be provider/model");
  const providerName = model.slice(0, separator);
  const modelId = model.slice(separator + 1);
  const providers = JSON.parse(providersJson);
  const provider = providers?.[providerName];
  if (provider) {
    if (process.env.SIMPLEXY_LOCAL_GATEWAY_URL?.trim()) {
      provider.baseUrl = process.env.SIMPLEXY_LOCAL_GATEWAY_URL.trim();
    }
    if (process.env.SIMPLEXY_LOCAL_GATEWAY_API_KEY?.trim()) {
      provider.apiKey = process.env.SIMPLEXY_LOCAL_GATEWAY_API_KEY.trim();
    }
  }
  if (!provider || typeof provider.baseUrl !== "string" || typeof provider.apiKey !== "string" || !provider.apiKey || provider.apiKey.startsWith("!")) throw new Error("Managed provider requires explicit baseUrl and literal apiKey");
  const upstreamBase = new URL(provider.baseUrl);
  if (!["https:", "http:"].includes(upstreamBase.protocol) || upstreamBase.username || upstreamBase.password || upstreamBase.search || upstreamBase.hash) throw new Error("Invalid managed provider URL");
  const api = provider.api ?? "openai-completions";
  if (!["openai-completions", "openai-responses"].includes(api)) throw new Error("Managed provider must use an OpenAI-compatible API");
  const token = randomBytes(32).toString("hex");
  const controllers = new Set<AbortController>();
  const server = http.createServer(async (req, res) => {
    const reject = (status: number) => { res.writeHead(status); res.end(); req.resume(); };
    const auth = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return reject(401);
    if (req.method !== "POST" || !["/v1/chat/completions", "/v1/responses"].includes(req.url ?? "")) return reject(404);
    const controller = new AbortController();
    controllers.add(controller);
    res.once("close", () => controller.abort());
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) return reject(413);
        chunks.push(chunk);
      }
      let body: Record<string, unknown>;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reject(400); }
      if (!body || Array.isArray(body) || body.model !== modelId) return reject(400);
      const url = provider.baseUrl.replace(/\/$/, "") + req.url!.slice(3);
      const response = await fetch(url, {
        method: "POST", redirect: "manual",
        headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]),
      });
      // Neither upstream errors nor redirects may disclose host credentials or internal URLs.
      if (!response.ok) { await response.body?.cancel(); return reject(502); }
      res.writeHead(200, { "content-type": response.headers.get("content-type") ?? "application/json" });
      if (response.body) for await (const chunk of response.body) {
        if (!res.write(chunk)) await new Promise<void>(resolve => { res.once("drain", resolve); res.once("close", resolve); });
        if (res.destroyed) break;
      }
      res.end();
    } catch { if (!res.headersSent) reject(502); else res.destroy(); }
    finally { controllers.delete(controller); }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}/v1`;
  return { token, port, baseUrl,
    models: { providers: { [providerName]: { baseUrl, apiKey: token, api, models: [{ id: modelId, name: modelId, reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 8192, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } },
    close: async () => { for (const controller of controllers) controller.abort(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); },
  };
}

export async function executeManagedLocal(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const runtime = await prepareManagedLocalRuntime(ctx.agent.companyId);
  if ((ctx.executionTarget && ctx.executionTarget.kind !== "local") || ctx.executionTransport?.remoteExecution) throw new Error("Managed local execution cannot override execution target");
  ctx.signal?.throwIfAborted();
  const model = process.env.SIMPLEXY_LOCAL_PI_MODEL;
  const providers = process.env.SIMPLEXY_LOCAL_PI_PROVIDERS;
  if (!model || !providers) throw new Error("Operator must explicitly configure SIMPLEXY_LOCAL_PI_MODEL and SIMPLEXY_LOCAL_PI_PROVIDERS; personal Pi credentials are never reused");
  const proxy = await startManagedInferenceProxy(model, providers);
  let configDir: string | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    const running = runningProcesses.get(ctx.runId);
    if (!running) return;
    signalRunningProcess(running, "SIGTERM");
    killTimer = setTimeout(() => { if (runningProcesses.get(ctx.runId) === running) signalRunningProcess(running, "SIGKILL"); }, 1000);
  };
  try {
    // A sibling of the writable company root prevents child-controlled symlink writes by the host.
    configDir = await fs.mkdtemp(path.join(path.dirname(runtime.root), ".pi-run-"));
    await fs.writeFile(path.join(configDir, "models.json"), JSON.stringify(proxy.models), { flag: "wx", mode: 0o600 });
    await fs.writeFile(path.join(configDir, "auth.json"), "{}", { flag: "wx", mode: 0o600 });
    const session = path.join(runtime.sessions, `${randomUUID()}.jsonl`);
    const candidate = ctx.runtime.sessionId;
    let sessionFile = session;
    if (candidate && path.dirname(candidate) === runtime.sessions) {
      const stat = await fs.lstat(candidate).catch(() => null);
      if (stat?.isFile() && !stat.isSymbolicLink()) sessionFile = candidate;
    }
    const sections = selectPaperclipPromptSections(ctx.context, { resumedSession: sessionFile !== session });
    const prompt = joinPromptSections([sections.wakePrompt, sections.taskContextNote, typeof ctx.config.promptTemplate === "string" ? ctx.config.promptTemplate : "Complete the assigned task within this company workspace.", "Network access is restricted to model inference. Return your completed task result in your final response; the host records that output. Do not attempt direct Paperclip API calls."]);
    const args = [runtime.piCommand, "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-approve", "--offline", "--mode", "json", "-p", "--provider", model.slice(0, model.indexOf("/")), "--model", model.slice(model.indexOf("/") + 1), "--session", sessionFile, "--tools", "read,bash,edit,write,grep,find,ls", "--", prompt];
    await ctx.onCancellationReady?.();
    ctx.signal?.throwIfAborted();
    ctx.signal?.addEventListener("abort", cancel, { once: true });
    const proc = await runChildProcess(ctx.runId, runtime.command, runtime.wrapArgs(args, proxy.port, configDir), {
      cwd: runtime.cwd, env: runtime.env, timeoutSec: 300, graceSec: 5, onLog: ctx.onLog,
      onSpawn: async meta => { if (ctx.signal?.aborted) cancel(); await ctx.onSpawn?.(meta); },
    });
    await ctx.onProviderStopped?.();
    const parsed = parsePiJsonl(proc.stdout);
    return { exitCode: proc.exitCode, signal: proc.signal, timedOut: proc.timedOut,
      errorMessage: proc.exitCode === 0 ? null : "Managed Pi execution failed", sessionId: sessionFile,
      sessionParams: { sessionId: sessionFile, cwd: runtime.cwd },
      summary: parsed.finalMessage ?? parsed.messages.join("\n"), usage: parsed.usage, model,
      resultJson: { stdout: proc.stdout, stderr: proc.stderr },
    };
  } finally {
    ctx.signal?.removeEventListener("abort", cancel);
    if (killTimer) clearTimeout(killTimer);
    await proxy.close();
    if (configDir) await fs.rm(configDir, { recursive: true, force: true });
  }
}
