# Docker deployment with local Hermes and Pi

This deployment runs Simplexy and both local agent CLIs in the application container. PostgreSQL is a separate container with no published database port. Application data and agent sessions persist in `simplexy-data`; the database persists in `simplexy-db`.

## Build

Build the repository's production image from the intended commit, then install the pinned agent CLIs:

```sh
docker build --target production --build-arg PAPERCLIP_BUILD_COMMIT="$(git rev-parse HEAD)" -t simplexy-core:0b79435e3 .
docker build -f docker/Dockerfile.local-agents -t simplexy-local-agents:0b79435e3 .
```

The native runner, provider pack, and CLI toolchains need substantial temporary disk space. Allow at least 70 GB free for the initial build. Do not prune volumes to recover build space.

## Runtime configuration

Create root-readable files outside the checkout, mode `0600`:

- `/etc/simplexy/database.env`: `POSTGRES_PASSWORD`.
- `/etc/simplexy/runtime.env`: `DATABASE_URL`, authentication secrets, public URL, allowed hostnames, and model gateway configuration.

Required model configuration:

- `SIMPLEXY_LOCAL_GATEWAY_URL`: OpenAI-compatible gateway URL reachable from the container, ending in `/v1`.
- `SIMPLEXY_LOCAL_GATEWAY_API_KEY`: gateway API key.
- `DEFAULT_LLM_MODEL`: the gateway model ID used by direct chat.
- `SIMPLEXY_LOCAL_PI_MODEL`: Pi's provider-prefixed model identifier.
- `PAPERCLIP_PI_PROVIDERS`: Pi providers JSON, including gateway URL, API key and model definitions.
- `SIMPLEXY_LOCAL_PI_PROVIDERS`: the same provider definitions for workspace model discovery.
- `OPENAI_BASE_URL` and `OPENAI_API_KEY`: the custom provider credentials used by Hermes.

Do not use `127.0.0.1` for a gateway outside the application container. A gateway on an operator's laptop is available only while the laptop is awake, reachable and running the gateway. Prefer a stable server gateway for unattended operation.

Start with:

```sh
docker compose -p simplexy -f docker/compose.local-agents.yml up -d
```

On Linux, leave `SIMPLEXY_LOCAL_AGENTS_ENABLED=false` and use ordinary `pi_local`/`hermes_local` adapters without `managedLocalWorkspace=true`. The managed Pi workspace runtime currently requires macOS `sandbox-exec`. Ordinary local agents share the application container's filesystem and privileges; they are not isolated from one another.

Pi is pinned to `@earendil-works/pi-coding-agent@0.74.0`, matching the local adapter's install contract.

Configure Hermes with `hermes config set` as the application user. Keep secrets in environment files, not in the image or repository. Agent workspace files, instructions and credentials from another machine are not automatically migrated.

## Acceptance checks

1. Check `/api/health` and confirm the container uses the intended image.
2. Run `hermes --version` and `pi --version` as the application user, not just root.
3. Execute a real model prompt with each CLI and through Simplexy's local adapters.
4. Create a test direct-chat session, verify a model reply and remove only that test session.
5. Complete first-admin onboarding before exposing the instance beyond the trusted network.

The previous server's database, uploads, sessions and agent instructions require a separate backup/restore. A fresh deployment is not a data migration.
