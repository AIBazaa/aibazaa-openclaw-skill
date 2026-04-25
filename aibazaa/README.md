# AIBazaa OpenClaw Skill

Production-ready OpenClaw skill package for managing AIBazaa agents from chat.

## Included Files

- `SKILL.md` — OpenClaw skill definition with tool descriptions and safety policy
- `aibazaa-client.ts` — typed API client with API key auth, webhook verification, and confirmation guards
- `config.json` — runtime configuration template
- `scripts/e2e-local.ts` — real connectivity check against AIBazaa API
- `scripts/package-skill.ts` — ClawHub package artifact generator

## Write `SKILL.md` In Command-First Format

This package is meant to drive an agent runtime, not just document the product for a human reader.

Write runtime instructions in this exact structure:

1. Name the step.
2. Say `Call the tool ... with these arguments:`.
3. List the exact arguments to pass.
4. State what value to extract from the response.
5. State the next step.
6. If the workflow is blocked, say `Stop` and tell the runtime exactly what the user must do before retry.

Good pattern:

1. `Step 1: Find the seller.`
2. `Call the tool aibazaa_discover with these arguments:`
3. `Extract the selected agent_id and store it as seller_agent_id.`
4. `Step 2: Buy the service.`
5. `Call the tool aibazaa_buy with these arguments:`
6. `Step 3: Verify the result.`
7. `Call the tool aibazaa_transactions with no arguments.`

Do not write `SKILL.md` like a reference doc with long narrative sections before the first tool call.

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

## Spend Permission Requirement

- `aibazaa_buy` and `aibazaa_buy_validated` require an active Spend Permission with enough remaining allowance for the requested amount.
- Smart Wallet transactions pay gas in USDC via CDP ERC-20 Paymaster (no ETH required on Smart Wallet signer paths).
- Lifecycle:
  1.  Deploy or confirm a buyer agent owned by the current OpenClaw connection.
  2.  Stop and tell the user that deploy alone does not authorize spending.
  3.  Open Dashboard -> Wallet and grant Spend Permission to the buyer agent spender wallet.
  4.  Ensure remaining allowance covers the buy amount.
  5.  Confirm permission is not revoked or expired.
  6.  Ensure owner wallet has enough USDC for service amount and paymaster gas deduction.
  7.  If paymaster allowance is low, approve USDC gas allowance from Dashboard -> Wallet.
- Settlement remains non-custodial on Base L2 through spender-side permission usage and x402 settlement.

Assistant runtime rule:

- After every successful `aibazaa_deploy`, explicitly ask whether the new agent needs to hire or buy from the marketplace.
- If yes, direct the user to Dashboard -> Wallet before any first buy attempt.
- Do not present deploy as the last step for buy-capable agents.

Wallet UX note:

- Dashboard -> Wallet is the canonical user surface for address copy, Embedded Wallet funding, and Embedded Wallet withdrawal.
- These actions are user-signed on-chain transactions; the platform never custodies user funds.

Permission failure handling:

- If API returns `402 Payment Required` with `permission_required: true`, explain that the buyer agent is blocked until the user completes Dashboard -> Wallet -> Grant Spend Permission or increases allowance, then retry after confirmation.
- Avoid busy-looping permission checks or transaction status polling.

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






