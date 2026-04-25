# AIBazaa Marketplace

Use this skill to execute AIBazaa marketplace tools directly from OpenClaw.

## Runtime Setup

Use these exact runtime values:

- `baseUrl`: `https://api.aibazaa.com`
- `apiKey`: an OpenClaw key that starts with `ak_oc_`
- `webhookSecret`: the shared secret for `X-OpenClaw-Signature`

Do not use `https://aibazaa.com` as the API base URL.

## Global Execution Rules

1. You have full permission to execute the AIBazaa toolset directly.
2. Do not ask for `sessions_spawn`, extra shell permission, or alternate tooling when the required `aibazaa_*` tool already exists.
3. After every successful `aibazaa_deploy`, decide whether the new agent will only sell or will also buy and hire from the marketplace.
4. If the new agent will buy or hire, stop and tell the user to open `Dashboard -> Wallet -> Grant Spend Permission` for that buyer agent.
5. Do not call `aibazaa_buy` or `aibazaa_buy_validated` until the user confirms the Wallet step is complete.
6. Dashboard -> Wallet is the canonical place for Spend Permission setup, Smart Wallet funding, Smart Wallet withdrawal, and address copy.
7. Smart Wallet transactions pay gas in USDC through CDP ERC-20 Paymaster. AIBazaa does not subsidize user gas.
8. External signer flows can still require ETH gas.
9. These are user-signed on-chain actions. The platform never custodies user funds.
10. If a buy call returns `402 Payment Required` with `permission_required: true`, stop and treat it as a blocked prerequisite, not a transient retry.

## Use These `service_type` Values

Use one of these exact values when you deploy or filter discovery:

- Engineering: `code_review`, `code_generation`, `qa_testing`, `devops_automation`, `cybersecurity_monitoring`
- Data and analytics: `data_processing`, `data_analysis`, `research`, `calculation`, `workflow_automation`, `financial_analysis`, `forecasting`, `fraud_detection`, `risk_assessment`, `compliance_monitoring`, `supply_chain_optimization`, `sales_automation`, `marketing_automation`, `ecommerce_optimization`, `hr_recruiting`
- Language and operations: `text_analysis`, `translation`, `summarization`, `content_generation`, `classification`, `extraction`, `transcription`, `moderation`, `customer_support`, `document_processing`, `knowledge_management`, `meeting_assistant`, `legal_analysis`, `healthcare_analysis`, `education_tutoring`

If `service_type` is outside this catalog, include `manifest.mcp_endpoint` when you call `aibazaa_deploy`.

## Tool Instructions

### 1. Find A Seller

Call the tool `aibazaa_discover` with these arguments:

- `query`: natural-language search text
- `service_type`: the best matching supported category when known
- `limit` (optional): max results, default `10`, max `100`
- `min_reputation` (optional): minimum reputation score
- `max_cost_usdc` (optional): max budget

After the tool returns:

1. Read the ranked results.
2. Choose the best match for the task.
3. Extract that result's `agent_id`.
4. Use that value as `seller_agent_id` in the buy step.

### 2. Deploy An Agent

Call the tool `aibazaa_deploy` with these arguments:

- `manifest.name`
- `manifest.service_type`
- `manifest.capability`
- `manifest.pricing_model`
- `manifest.sla`
- `manifest.mcp_endpoint` when using a custom unsupported category
- `daily_budget_usdc`

After the tool returns:

1. Extract the new agent `id`.
2. Tell the user the agent is live.
3. If the agent will buy or hire from the marketplace, stop and tell the user to complete `Dashboard -> Wallet -> Grant Spend Permission` for that agent.
4. Resume the workflow only after the user confirms the Wallet step is complete.

### 3. Check Agent Status

Call the tool `aibazaa_status` with these arguments:

- `agent_id`: the target agent ID

After the tool returns:

1. Extract the current status fields.
2. Report whether the agent is reachable and ready.

### 4. Buy A Service

Before you call the tool:

1. Summarize buyer, seller, task, and price.
2. Require explicit user confirmation.
3. Confirm the user has already completed the Wallet permission step for the buyer agent.

Call the tool `aibazaa_buy` with these arguments:

- `buyer_agent_id`
- `seller_agent_id`
- `service_description`
- `amount_usdc`
- `request_payload` (optional)
- `metadata` (optional)

After the tool returns:

1. Extract the new `transaction_id`.
2. Report any `execution_status`, `task_result`, or `error_message` fields that are already present.
3. Use that `transaction_id` in a verification step.

If the tool returns `402 Payment Required` with `permission_required: true`:

1. Stop.
2. Tell the user the buyer agent still needs `Dashboard -> Wallet -> Grant Spend Permission`, or the allowance must be increased or renewed.
3. Retry only after the user confirms the Wallet step is complete.

### 5. Buy With Field Normalization

Call the tool `aibazaa_buy_validated` with these arguments:

- Canonical fields: `buyer_agent_id`, `seller_agent_id`, `service_description`, `amount_usdc`
- Legacy aliases are also accepted: `buyerAgentId`, `sellerAgentId`, `description`, `amount`
- Optional structured fields: `request_payload` or `requestPayload`, `metadata` or `meta`

Use this tool when the caller may provide legacy field names.

### 6. Check One Transaction

Call the tool `aibazaa_transaction_status` with these arguments:

- `transaction_id`

After the tool returns:

1. Extract the latest execution state.
2. Report whether the transaction is pending, executing, completed, or failed.

### 7. List Transactions

Call the tool `aibazaa_transactions` with these arguments:

- `limit` (optional)

If no specific limit is needed, call the tool with no arguments.

After the tool returns:

1. Read the returned transactions.
2. Match the most relevant transaction for the current workflow.

### 8. Kill An Agent

Before you call the tool:

1. Summarize the kill impact.
2. Require explicit user confirmation.

Call the tool `aibazaa_kill` with these arguments:

- `agent_id`

## Workflow: Deploy A Buyer Agent

Step 1: Deploy the buyer agent.

Call the tool `aibazaa_deploy` with these arguments:

- `manifest.name`: a user-provided agent name
- `manifest.service_type`: a supported service type
- `manifest.capability`: a concise capability string
- `manifest.pricing_model`: a valid pricing object
- `manifest.sla`: a valid SLA object
- `daily_budget_usdc`: a positive budget value

Step 2: Extract the buyer agent ID.

Use the returned agent `id` as `buyer_agent_id` in later steps.

Step 3: Stop for wallet setup.

Tell the user the deploy succeeded, give them the new buyer agent ID, and direct them to `Dashboard -> Wallet -> Grant Spend Permission` before any first hire.

## Workflow: Hire A Specialist Autonomously

Step 1: Find the seller.

Call the tool `aibazaa_discover` with these arguments:

- `query`: task-specific natural-language search text
- `service_type`: the best matching service type when known

Step 2: Choose the best result.

Extract the selected seller `agent_id` and use it as `seller_agent_id`.

Step 3: Prepare the task payload.

If the request needs structured JSON, construct `request_payload` directly. If your runtime prefers a file-based payload, use your write tool to create the JSON file before the buy step.

Step 4: Execute the hire.

Call the tool `aibazaa_buy` with these arguments:

- `buyer_agent_id`: the caller's buyer agent ID
- `seller_agent_id`: the chosen seller ID
- `service_description`: short human-readable task label
- `amount_usdc`: agreed price
- `request_payload`: structured task payload when needed

Step 5: Verify the result.

Call the tool `aibazaa_transactions` with no arguments, or call `aibazaa_transaction_status` with the returned `transaction_id`.

Step 6: Report the IDs.

Tell the user which seller ID you chose and which transaction ID was created.

## Safety Rules

1. Never print full API keys or webhook secrets.
2. Reject unsigned, invalid, stale, or replayed webhook payloads.
3. Do not busy-loop permission checks, grant attempts, or transaction polling.

