import nodemailer from "nodemailer";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { z } from "zod";
import { logger } from "../middleware/logger.js";

export function passwordRecoveryPlugin() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || 587);
  const configured = Boolean(host && user && pass && Number.isInteger(port) && port > 0 && port <= 65535);
  const transport = configured ? nodemailer.createTransport({
    host, port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: user!, pass: pass! },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  }) : null;
  const plugin = emailOTP({
    otpLength: 6,
    expiresIn: 300,
    allowedAttempts: 3,
    storeOTP: "hashed",
    disableSignUp: true,
    rateLimit: { window: 60, max: 3 },
    async sendVerificationOTP({ email, otp }) {
      // Do not await delivery: SMTP latency/failures must not reveal registered accounts.
      void transport!.sendMail({
        from: process.env.SMTP_FROM?.trim() || "Simplexy <rahmattri154@gmail.com>",
        to: email,
        subject: "Kode reset kata sandi Simplexy",
        text: `Kode reset kata sandi Anda: ${otp}\n\nBerlaku selama 5 menit. Jangan bagikan kode ini. Jika Anda tidak meminta reset, abaikan email ini.`,
      }).catch(() => logger.error("Password recovery email delivery failed; check SMTP configuration"));
    },
  });
  return {
    ...plugin,
    // Recovery must not also enable passwordless login or email-change APIs.
    endpoints: {
      requestPasswordResetEmailOTP: plugin.endpoints.requestPasswordResetEmailOTP,
      resetPasswordEmailOTP: plugin.endpoints.resetPasswordEmailOTP,
    },
    hooks: {
      before: [{
        matcher: (ctx: { path?: string }) => ctx.path === "/email-otp/request-password-reset" || ctx.path === "/email-otp/reset-password",
        handler: createAuthMiddleware(async (ctx) => {
          if (!transport) throw new APIError("SERVICE_UNAVAILABLE", { message: "Pemulihan kata sandi belum tersedia. Hubungi administrator." });
          if (!z.email().safeParse(ctx.body?.email).success) {
            throw new APIError("BAD_REQUEST", { message: "Alamat email tidak valid." });
          }
        }),
      }],
    },
  };
}
