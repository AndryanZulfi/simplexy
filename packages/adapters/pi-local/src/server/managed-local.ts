import fs from "node:fs/promises";
import path from "node:path";
import { resolvePaperclipInstanceRootForAdapter } from "@simplexy/adapter-utils/server-utils";

// This is an OS filesystem boundary; HOME/cwd alone are not isolation.
export async function prepareManagedLocalRuntime(companyId: string, operatorEnv: NodeJS.ProcessEnv = process.env) {
  if (operatorEnv.SIMPLEXY_LOCAL_AGENTS_ENABLED !== "true") throw new Error("Managed local agents are disabled");
  if (process.platform !== "darwin") throw new Error("Managed local agents require macOS sandbox-exec");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) throw new Error("Invalid company identity");
  const instance = resolvePaperclipInstanceRootForAdapter({ env: operatorEnv });
  await fs.mkdir(instance, { recursive: true, mode: 0o700 });
  const base = path.join(await fs.realpath(instance), "local-workspaces");
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(base)).isSymbolicLink()) throw new Error("Managed runtime base must not be a symlink");
  const root = path.join(base, companyId);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  // Refuse symlink-redirection of any managed directory before the server writes into it.
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error("Managed runtime root must not be a symlink");
  const dirs = ["workspace", "home", "pi", "config", "cache", "data", "tmp", "sessions"];
  for (const name of dirs) {
    const dir = path.join(root, name);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(dir)).isSymbolicLink()) throw new Error("Managed runtime directory must not be a symlink");
  }
  const piCommand = operatorEnv.SIMPLEXY_LOCAL_PI_COMMAND;
  if (!piCommand || !path.isAbsolute(piCommand)) throw new Error("SIMPLEXY_LOCAL_PI_COMMAND must name an installed absolute Pi binary");
  const piReal = await fs.realpath(piCommand);
  const nodeDir = path.dirname(piCommand);
  const readRoots = ["/System", "/usr", "/bin", "/sbin", "/dev", path.dirname(nodeDir), path.dirname(path.dirname(piReal))];
  const subpath = (value: string) => `(subpath ${JSON.stringify(value)})`;
  const profile = (port?: number, configDir?: string) => `(version 1)
(deny default)
(allow process*)
(allow file-read* (subpath "/private/etc") (subpath "/Library/Apple") (subpath "/private/var/db/dyld"))
(allow signal (target self))
(allow sysctl-read mach-lookup)
${port === undefined ? "" : `(allow network-outbound (remote tcp "localhost:${port}"))`}
${configDir ? `(allow file-read* ${subpath(configDir)})` : ""}
(allow file-read-metadata)
(allow file-read* (literal "/"))
(allow file-read* ${readRoots.map(subpath).join(" ")} ${subpath(root)} (literal "/private/etc/hosts") (literal "/private/etc/resolv.conf") (subpath "/private/etc/ssl"))
(allow file-write* ${subpath(root)} ${configDir ? subpath(configDir) : ""} (literal "/dev/null"))`;
  const env: Record<string, string> = {
    HOME: path.join(root, "home"), PI_CODING_AGENT_DIR: path.join(root, "pi"),
    XDG_CONFIG_HOME: path.join(root, "config"), XDG_CACHE_HOME: path.join(root, "cache"), XDG_DATA_HOME: path.join(root, "data"),
    TMPDIR: path.join(root, "tmp"), PATH: `${nodeDir}:/usr/bin:/bin:/usr/sbin:/sbin`, LANG: "en_US.UTF-8",
  };
  return { root, cwd: path.join(root, "workspace"), sessions: path.join(root, "sessions"), env, piCommand,
    command: "/usr/bin/sandbox-exec",
    // env -i is necessary because the existing child-process helper merges the backend environment.
    wrapArgs: (args: string[], port?: number, configDir?: string) => {
      if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error("Invalid inference proxy port");
      const childEnv = { ...env, PI_OFFLINE: "1", PI_TELEMETRY: "0", ...(configDir ? { PI_CODING_AGENT_DIR: configDir } : {}) };
      return ["-p", profile(port, configDir), "/usr/bin/env", "-i", ...Object.entries(childEnv).map(([key, value]) => `${key}=${value}`), ...args];
    },
  };
}
