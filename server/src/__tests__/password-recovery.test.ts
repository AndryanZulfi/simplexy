import { createDb, authVerifications, authSessions } from "@simplexy/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Config } from "../config.js";
import { createBetterAuthInstance } from "../auth/better-auth.js";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

const sendMail = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));

describe("password recovery through Better Auth HTTP handlers", () => {
  const origin = "http://localhost:43123";
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let auth: ReturnType<typeof createBetterAuthInstance>;
  let ip = 1;
  const email = "recovery-fixture@example.test";
  const config = { deploymentMode: "authenticated", deploymentExposure: "private", authBaseUrlMode: "explicit", authPublicBaseUrl: origin, authDisableSignUp: false } as Config;
  const post = (path: string, body: unknown, address = `192.0.2.${ip++}`) => auth.handler(new Request(`${origin}/api/auth${path}`, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-for": address }, body: JSON.stringify(body),
  }));
  async function requestCode() {
    const response = await post("/email-otp/request-password-reset", { email });
    expect(response.status).toBe(200);
    return String(sendMail.mock.calls.at(-1)![0].text).match(/\d{6}/)![0];
  }
  const reset = (otp: string) => post("/email-otp/reset-password", { email, otp, password: "new-fixture-password" });

  beforeAll(async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "password-recovery-test-secret-at-least-32-characters");
    vi.stubEnv("SMTP_HOST", "smtp.example.test");
    vi.stubEnv("SMTP_USER", "fixture");
    vi.stubEnv("SMTP_PASSWORD", "fixture-not-real");
    vi.stubEnv("PAPERCLIP_AUTH_RATE_LIMIT_ENABLED", "true");
    database = await startEmbeddedPostgresTestDatabase("simplexy-password-recovery-");
    db = createDb(database.connectionString);
    auth = createBetterAuthInstance(db, config, [origin]);
    expect((await post("/sign-up/email", { email, name: "Recovery fixture", password: "old-fixture-password" })).status).toBe(200);
  }, 30_000);
  afterAll(async () => { vi.unstubAllEnvs(); await db?.$client.end(); await database?.cleanup(); });

  it("uses hashed codes, changes the password, revokes sessions and rejects reuse", async () => {
    const otp = await requestCode();
    const [record] = await db.select().from(authVerifications);
    expect(record.value).not.toContain(otp);
    expect(record.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    const sessions = await db.select().from(authSessions);
    expect(sessions.length).toBeGreaterThan(0);
    expect((await reset(otp)).status).toBe(200);
    expect(await db.select().from(authSessions)).toHaveLength(0);
    expect((await reset(otp)).status).toBe(400);
    expect((await post("/sign-in/email", { email, password: "old-fixture-password" })).status).toBe(401);
    expect((await post("/sign-in/email", { email, password: "new-fixture-password" })).status).toBe(200);
  });
  it("rejects wrong codes and exhausts the attempt budget", async () => {
    const otp = await requestCode();
    const wrong = otp === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i++) expect((await reset(wrong)).status).toBe(400);
    expect((await reset(otp)).status).toBe(403);
    expect((await reset(otp)).status).toBe(400);
  });
  it("rejects expired codes", async () => {
    const otp = await requestCode();
    await db.update(authVerifications).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await reset(otp)).status).toBe(400);
  });
  it("rotates codes on resend and rejects a concurrent replay", async () => {
    const old = await requestCode();
    const latest = await requestCode();
    if (old !== latest) expect((await reset(old)).status).toBe(400);
    const results = await Promise.all([reset(latest), reset(latest)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
  });
  it("returns the same response for registered and unknown emails and does not send to strangers", async () => {
    const known = await post("/email-otp/request-password-reset", { email });
    const calls = sendMail.mock.calls.length;
    const unknown = await post("/email-otp/request-password-reset", { email: "unknown@example.test" });
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(sendMail).toHaveBeenCalledTimes(calls);
  });
  it("does not leak delivery failures or expose passwordless login", async () => {
    sendMail.mockRejectedValueOnce(new Error("synthetic SMTP failure"));
    expect((await post("/email-otp/request-password-reset", { email })).status).toBe(200);
    expect((await post("/sign-in/email-otp", { email, otp: "123456" })).status).toBe(404);
    expect((await post("/email-otp/send-verification-otp", { email, type: "sign-in" })).status).toBe(404);
  });
  it("validates email and password at the server boundary", async () => {
    expect((await post("/email-otp/request-password-reset", { email: "invalid" })).status).toBe(400);
    const otp = await requestCode();
    expect((await post("/email-otp/reset-password", { email, otp, password: "short" })).status).toBe(400);
    expect((await reset(otp)).status).toBe(200);
  });
  it("rate-limits recovery requests per IP", async () => {
    for (let i = 0; i < 3; i++) expect((await post("/email-otp/request-password-reset", { email: "unknown@example.test" }, "198.51.100.1")).status).toBe(200);
    expect((await post("/email-otp/request-password-reset", { email }, "198.51.100.1")).status).toBe(429);
  });
  it("fails equally for every account when mail is not configured", async () => {
    vi.stubEnv("SMTP_HOST", "");
    auth = createBetterAuthInstance(db, config, [origin]);
    expect((await post("/email-otp/request-password-reset", { email })).status).toBe(503);
    expect((await post("/email-otp/request-password-reset", { email: "unknown@example.test" })).status).toBe(503);
  });
});
