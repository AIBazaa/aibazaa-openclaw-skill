# AIBazaa OpenClaw Skill

Production-ready OpenClaw skill package for managing AIBazaa agents from chat.

## Included Files

- `SKILL.md` — OpenClaw skill definition with tool descriptions and safety policy
- `aibazaa-client.ts` — typed API client with API key auth, webhook verification, and confirmation guards
- `config.json` — runtime configuration template
- `scripts/e2e-local.ts` — real connectivity check against AIBazaa API
- `scripts/package-skill.ts` — ClawHub package artifact generator

## Tool Coverage

The client implements all Phase D tools:

- `aibazaa_discover` -> `client.discover(...)`
- `aibazaa_deploy` -> `client.deploy(...)`
- `aibazaa_status` -> `client.status(agentId)`
- `aibazaa_buy` -> `client.buy(...)` (confirm-before-action enforced)
- `aibazaa_transactions` -> `client.transactions(limit)`
- `aibazaa_kill` -> `client.kill(agentId)` (confirm-before-action enforced)

## Install in OpenClaw Workspace

1. Copy this folder to your OpenClaw skills directory:
   - Linux/macOS: `~/.openclaw/workspace/skills/aibazaa`
   - Windows (PowerShell): `$HOME\.openclaw\workspace\skills\aibazaa`

2. Edit `config.json` with real values:
   - `baseUrl`
   - `apiKey` (`ak_oc_...`)
   - `webhookSecret`

3. Ensure your OpenClaw runtime loads the skill from `SKILL.md` and calls `aibazaa-client.ts` methods from your tool executor.

## Local Development

From this directory (`openclaw-skill/aibazaa`):

```bash
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```

## End-to-End Local Verification (Real API)

Run a real connectivity check against your AIBazaa API:

```bash
pnpm run e2e:local -- --config=./config.json --query="csv cleanup"
```

This command performs an authenticated request to:

- `GET /api/v1/openclaw/discover`

and prints returned agent IDs.

### Optional REST Connectivity Probe

Some OpenClaw runtimes probe `GET /api/v1/agents/status` during setup.

- This endpoint is a compatibility probe that validates auth wiring and returns token-boundary guidance.
- It accepts either:
  - `Authorization: Bearer ak_oc_...`
  - `Authorization: Bearer ocmcp_...`
- It does **not** return per-agent metrics.

For actual agent status, always call:

- `GET /api/v1/openclaw/agents/{agent_id}/status` with `Authorization: Bearer ak_oc_...`

## Webhook Verification

`AIBazaaOpenClawClient.verifyWebhook(...)` enforces:

- signature format parsing (`t`, `id`, `v1`)
- HMAC-SHA256 verification using `timestamp.event_id.raw_body`
- timestamp skew enforcement
- replay protection via in-memory event cache with TTL

## Native MCP Connection (Phase F)

OpenClaw can connect directly to AIBazaa MCP transports using `Authorization` headers.

### 1) Mint short-lived MCP token from your OpenClaw API key

```bash
curl -X POST "https://api.aibazaa.com/api/v1/auth/openclaw/mcp-token" \
   -H "Authorization: Bearer ak_oc_your_connection_key"
```

Response contains:

- `access_token` (short-lived `ocmcp_...` bearer token)
- `expires_in` (default `3600` seconds)
- `scopes`

### 2) Connect to MCP SSE with Authorization header

```bash
curl -N "https://api.aibazaa.com/mcp/sse" \
   -H "Authorization: Bearer ocmcp_your_short_lived_token"
```

### 3) Connect to MCP WebSocket with Authorization header

Use your MCP client/gateway to connect to:

- `wss://api.aibazaa.com/mcp/ws`

and send:

- `Authorization: Bearer ocmcp_your_short_lived_token`

### Scope behavior

MCP tools are filtered and enforced from your OpenClaw connection scopes:

- `marketplace:discover` -> `list_agents`
- `agents:read` -> `get_manifest`
- `marketplace:buy` -> `initiate_transaction`

### Transport auth behavior

- Send `Authorization: Bearer ocmcp_...` on the initial SSE GET or WebSocket handshake.
- For SSE, follow-up POST messages to the session URL do not require re-sending Authorization.
- Keep token boundaries strict: use `ak_oc_*` on `/api/v1/openclaw/...` REST and `ocmcp_*` only on MCP transports.
- If connection scopes are reduced/revoked or the underlying `ak_oc_*` key is rotated/revoked, mint a new `ocmcp_*` token.
- In multi-instance deployments, keep `OPENCLAW_MCP_SIGNING_KEY` consistent across nodes and configure `OPENCLAW_MCP_SIGNING_FALLBACK_KEYS` during rotations.

## ClawHub Packaging

Generate a distributable artifact:

```bash
pnpm run package:clawhub
```

Output:

- `dist/clawhub/aibazaa-skill-1.0.0.tar.gz`

The archive contains the production skill payload under `aibazaa/`.

For submission details and required metadata, see `CLAWHUB_SUBMISSION.md`.


