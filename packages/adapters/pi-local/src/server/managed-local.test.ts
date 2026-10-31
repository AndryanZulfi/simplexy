import fs from "node:fs/promises";
import os from "node:os";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { prepareManagedLocalRuntime } from "./managed-local.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.map(root => fs.rm(root, { recursive: true, force: true }))); });

it("derives company paths, strips ambient secrets, and enforces filesystem denials in child processes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "managed-pi-test-")); roots.push(root);
  const outside = path.join(root, "outside-secret"); await fs.writeFile(outside, "private");
  const companyId = "12345678-1234-1234-1234-123456789abc";
  const runtime = await prepareManagedLocalRuntime(companyId, { SIMPLEXY_LOCAL_AGENTS_ENABLED: "true", PAPERCLIP_HOME: root, SIMPLEXY_LOCAL_PI_COMMAND: "/Users/idn/.nvm/versions/node/v24.21.0/bin/pi", AMBIENT_SECRET: "must-not-leak" });
  expect(runtime.env.HOME).toContain(`/local-workspaces/${companyId}/home`);
  expect(runtime.env.AMBIENT_SECRET).toBeUndefined();
  await fs.symlink(outside, path.join(runtime.cwd, "escape"));
  const script = `const fs=require('fs');let denied=0;for(const p of ${JSON.stringify([outside, path.join(runtime.cwd, "escape"), path.join(os.homedir(), ".hermes")])}){try{fs.readFileSync(p);process.exit(11)}catch(e){if(e.code==='EPERM'||e.code==='EACCES')denied++;else process.exit(12)}}fs.writeFileSync('ok','ok');try{fs.writeFileSync(${JSON.stringify(outside)},'bad');process.exit(13)}catch(e){if(e.code!=='EPERM'&&e.code!=='EACCES')process.exit(14)}console.log('denied='+denied)`;
  const result = spawnSync(runtime.command, runtime.wrapArgs([process.execPath, "-e", script]), { cwd: runtime.cwd, env: runtime.env, encoding: "utf8" });
  expect({ status: result.status, stderr: result.stderr, stdout: result.stdout }).toEqual({ status: 0, stderr: "", stdout: "denied=3\n" });
  expect(await fs.readFile(outside, "utf8")).toBe("private");
  const pi = spawnSync(runtime.command, runtime.wrapArgs([runtime.piCommand, "--version"]), { cwd: runtime.cwd, env: runtime.env, encoding: "utf8" });
  expect({ status: pi.status, stderr: pi.stderr }).toEqual({ status: 0, stderr: "" });
  expect(pi.stdout.trim()).not.toBe("");
  const server = http.createServer((_req, res) => res.end("allowed"));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as import("node:net").AddressInfo).port;
  const probe = async (allowed?: number) => {
    const script = `const net=require('net');const s=net.connect(${port},'127.0.0.1');s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',e=>{console.log(e.code);process.exit(2)});setTimeout(()=>process.exit(3),2000)`;
    return await new Promise<{ code: number | null; output: string }>(resolve => {
      const child = spawn(runtime.command, runtime.wrapArgs([process.execPath, "-e", script], allowed), { cwd: runtime.cwd, env: runtime.env });
      let output = ""; child.stdout.on("data", data => output += data); child.stderr.on("data", data => output += data);
      child.on("close", code => resolve({ code, output }));
    });
  };
  try {
    expect(await probe()).toEqual({ code: 2, output: "EPERM\n" });
    expect(await probe(port)).toEqual({ code: 0, output: "" });
    expect(await probe(port === 65535 ? port - 1 : port + 1)).toEqual({ code: 2, output: "EPERM\n" });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
