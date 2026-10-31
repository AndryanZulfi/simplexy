import { expect, it } from "vitest";
import http from "node:http";
import { execute } from "./execute.js";
import { startManagedInferenceProxy, executeManagedLocal } from "./managed-execute.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

it("dispatches managed execution from operator policy even without the editable flag", async () => {
  const previous = process.env.SIMPLEXY_LOCAL_AGENTS_ENABLED;
  process.env.SIMPLEXY_LOCAL_AGENTS_ENABLED = "true";
  try {
    await expect(execute({ config: {}, agent: { companyId: "invalid" } } as never)).rejects.toThrow("Invalid company identity");
  } finally { if (previous === undefined) delete process.env.SIMPLEXY_LOCAL_AGENTS_ENABLED; else process.env.SIMPLEXY_LOCAL_AGENTS_ENABLED = previous; }
});

it("runs the installed Pi through the sandbox and broker and collects only after exit", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-execute-test-"));
  const previous = { ...process.env };
  let calls = 0;
  const upstream = http.createServer(async (req, res) => {
    for await (const _ of req) { /* consume */ }
    calls++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: ' + JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test-model", choices: [{ index: 0, delta: { role: "assistant", content: "SANDBOX_EXECUTION_OK" }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) + '\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  Object.assign(process.env, { SIMPLEXY_LOCAL_AGENTS_ENABLED: "true", PAPERCLIP_HOME: root, SIMPLEXY_LOCAL_PI_COMMAND: "/Users/idn/.nvm/versions/node/v24.21.0/bin/pi", SIMPLEXY_LOCAL_PI_MODEL: "managed/test-model", SIMPLEXY_LOCAL_PI_PROVIDERS: JSON.stringify({ managed: { baseUrl: `http://127.0.0.1:${(upstream.address() as import("node:net").AddressInfo).port}/v1`, apiKey: "test-host-key" } }) });
  let stopped = 0;
  try {
    const result = await executeManagedLocal({ runId: "managed-test", agent: { companyId: "12345678-1234-1234-1234-123456789abc" }, config: {}, runtime: {}, context: {}, onLog: async () => {}, onProviderStopped: async () => { stopped++; } } as never);
    expect({ exit: result.exitCode, error: result.errorMessage, summary: result.summary, stderr: result.resultJson?.stderr }).toEqual({ exit: 0, error: null, summary: "SANDBOX_EXECUTION_OK", stderr: "" });
    expect(calls).toBe(1);
    expect(stopped).toBe(1);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await new Promise<void>(resolve => upstream.close(() => resolve()));
    await fs.rm(root, { recursive: true, force: true });
  }
}, 30000);

it("brokers only authenticated bounded inference for the configured model without exposing upstream credentials", async () => {
  const received: string[] = [];
  const upstream = http.createServer((req, res) => {
    received.push(req.url!, req.headers.authorization!);
    res.writeHead(req.url === "/v1/chat/completions" ? 200 : 302, { location: "http://127.0.0.1:1/escape" });
    res.end('{"ok":true}');
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address() as import("node:net").AddressInfo;
  const proxy = await startManagedInferenceProxy("custom/ag/gemini-3.8-flash", JSON.stringify({ custom: { baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "host-only-secret", api: "openai-completions" } }));
  try {
    expect(JSON.stringify(proxy.models)).not.toContain("host-only-secret");
    const send = (route: string, body: unknown, token = proxy.token) => fetch(proxy.baseUrl + route, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: typeof body === "string" ? body : JSON.stringify(body) });
    expect((await send("/chat/completions", { model: "ag/gemini-3.8-flash" }, "wrong")).status).toBe(401);
    expect((await send("/models", {})).status).toBe(404);
    expect((await send("/chat/completions", { model: "other" })).status).toBe(400);
    expect((await send("/chat/completions", "x".repeat(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await send("/chat/completions", { model: "ag/gemini-3.8-flash" })).status).toBe(200);
    expect((await send("/responses", { model: "ag/gemini-3.8-flash" })).status).toBe(502);
    expect(received).toEqual(["/v1/chat/completions", "Bearer host-only-secret", "/v1/responses", "Bearer host-only-secret"]);
  } finally { await proxy.close(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
  await expect(fetch(proxy.baseUrl)).rejects.toThrow();
});
