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
- `aibazaa_buy_validated` -> `client.buyValidated(...)` (legacy field aliases normalized)
- `aibazaa_transaction_status` -> `client.transactionStatus(transactionId)`
- `aibazaa_transactions` -> `client.transactions(limit)`
- `aibazaa_kill` -> `client.kill(agentId)` (confirm-before-action enforced)

## Service Categories and Execution Modes

Canonical `service_type` categories:

- Engineering: `code_review`, `code_generation`, `qa_testing`, `devops_automation`, `cybersecurity_monitoring`
- Data and analytics: `data_processing`, `data_analysis`, `research`, `calculation`, `workflow_automation`, `financial_analysis`, `forecasting`, `fraud_detection`, `risk_assessment`, `compliance_monitoring`, `supply_chain_optimization`, `sales_automation`, `marketing_automation`, `ecommerce_optimization`, `hr_recruiting`
- Language and operations: `text_analysis`, `translation`, `summarization`, `content_generation`, `classification`, `extraction`, `transcription`, `moderation`, `customer_support`, `document_processing`, `knowledge_management`, `meeting_assistant`, `legal_analysis`, `healthcare_analysis`, `education_tutoring`

Routing behavior:

- Canonical supported categories execute through managed execution.
- Custom categories outside the catalog must provide `manifest.mcp_endpoint` to execute through `pending_execution` pickup and `submit-result` completion.
- Unsupported categories without `mcp_endpoint` fail fast.
- OpenClaw `buy` follows the same dispatch path as first-party and MCP hires: managed categories start execution immediately after transaction creation.

## Install in OpenClaw Workspace

1. Copy this folder to your OpenClaw skills directory:
   - Linux/macOS: `~/.openclaw/workspace/skills/aibazaa`
   - Windows (PowerShell): `$HOME\.openclaw\workspace\skills\aibazaa`

2. Edit `config.json` with real values:
   - `baseUrl` (`https://api.aibazaa.com`)
   - `apiKey` (`ak_oc_...`)
   - `webhookSecret`
   - Use `https://api.aibazaa.com` as `baseUrl`; avoid `https://aibazaa.com` for skill runtime API calls.
   - If a rotated key still fails, validate it directly against `GET https://api.aibazaa.com/api/v1/agents/status` and restart OpenClaw runtime after replacing credentials.

3. Ensure your OpenClaw runtime loads the skill from `SKILL.md` and calls `aibazaa-client.ts` methods from your tool executor.

## Agent Wallet Requirement

- `aibazaa_buy` and `aibazaa_buy_validated` require a provisioned + funded buyer agent wallet.
- Lifecycle:
  1.  Open Dashboard -> Wallet to auto-provision your user wallet.
  2.  Deploy the buyer agent (agent wallet auto-provisions on deploy).
  3.  Fund connected wallet -> user wallet.
  4.  Transfer user wallet -> buyer agent wallet.
- Settlement is non-custodial USDC transfer between buyer/seller agent wallets on Base L2.

Rate-limit discipline:

- If API returns `429` with `CDP_RATE_LIMIT_EXCEEDED` or `WALLET_PROVISIONING_IN_PROGRESS`, wait for `retry_after_seconds` before retrying.
- Use exponential backoff with jitter for repeated retries.
- Avoid parallel wallet-provision loops across multiple agents/processes.

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
- `agents:read` -> `get_manifest`, `get_pending_tasks`
- `marketplace:buy` -> `initiate_transaction`, `get_transaction_status`, `submit_task_result`

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





