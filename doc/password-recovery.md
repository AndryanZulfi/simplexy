# Password recovery

Self-hosted email/password users choose **Lupa kata sandi?** on `/auth`, request
an email code, then enter the code and a new password twice. After success they
sign in normally; all existing sessions are revoked. Managed Cloud sign-in is
unchanged and continues through its identity provider.

## Instance mail configuration

Set these in the server's environment/secret manager, then restart the server:

- `SMTP_HOST`: SMTP hostname (Gmail: `smtp.gmail.com`).
- `SMTP_PORT`: `465` for implicit TLS or `587` for required STARTTLS (default).
- `SMTP_USER`: authenticated sending account.
- `SMTP_PASSWORD`: SMTP credential (Gmail requires a Google app password).
- `SMTP_FROM`: optional sender; defaults to `Simplexy <rahmattri154@gmail.com>`.
  The SMTP provider must authorize the sender address.

Company Apps email connections and the Simplexy ID Gmail OAuth connector are
not instance authentication mail transports. They are not reused for anonymous
password recovery, which must not depend on a company or signed-in user.
Without valid SMTP configuration the recovery endpoints return the same 503 for
all addresses. Normal sign-in remains available. SMTP connections have bounded
timeouts and enforce TLS; there is no insecure local relay mode.

## Security and delivery behavior

Better Auth 1.7.2's native email OTP plugin owns code generation, hashing,
verification, expiry and atomic single-use consumption in the existing
`auth_verifications` table; no migration is required. Codes have six digits,
expire in five minutes and allow three incorrect attempts. A new request rotates
the code. Passwords retain Better Auth's default 8–128 character bounds.
Only the two password-recovery plugin endpoints are exposed; passwordless
sign-in and OTP email-change endpoints are not enabled.

In authenticated mode Better Auth limits each recovery endpoint to three
requests per minute per IP, using its existing process-local limiter. Keep
`PAPERCLIP_AUTH_RATE_LIMIT_ENABLED` enabled (the authenticated-mode default).
An explicit `false` disables this existing global limiter, including recovery;
do not use it for an internet-facing deployment. Configure a trusted ingress
that replaces client-supplied forwarding headers and applies shared limits for
multi-replica deployments. This is not a distributed per-mailbox abuse limiter.

Requests return the same generic success body for registered and unknown emails.
SMTP delivery runs asynchronously so transport latency or failures do not expose
registered accounts; failures log a generic operator error without the recipient,
code or credentials. There is no durable delivery queue or automatic retry:
users may request a fresh code after a minute. Success means the request was
accepted, not proof of inbox delivery. Unknown addresses receive no email.

## Local verification

From `server/`:

```sh
pnpm exec vitest run src/__tests__/password-recovery.test.ts
```

The tests create an isolated embedded PostgreSQL database and exercise actual
Better Auth HTTP handlers. Only SMTP transport is mocked; no real users or
inboxes are touched. They cover successful reset/login, invalid/expired/reused
codes, concurrent replay, rotation, hashed storage, attempt limits, session
revocation, generic responses, delivery failure, validation and rate limiting.
UI interaction coverage lives in `ui/src/pages/PasswordRecovery.test.tsx`.
Live SMTP credentials, provider acceptance and inbox delivery require a separately
authorized send to a test mailbox; these tests do not prove live delivery.
