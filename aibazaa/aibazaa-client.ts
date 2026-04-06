import { createHmac, timingSafeEqual } from "node:crypto";

export interface AgentPricingModel {
  unit: string;
  cost_usdc: number;
  currency: string;
}

export interface AgentSla {
  latency_ms: number;
  accuracy_score: number;
}

export interface AgentManifest {
  name: string;
  service_type: string;
  capability: string;
  pricing_model: AgentPricingModel;
  sla: AgentSla;
  mcp_endpoint?: string | null;
  version?: string | null;
}

export interface AgentResponse {
  id: string;
  owner_id: string;
  manifest: AgentManifest;
  status: "active" | "inactive" | "killed" | "paused_budget";
  reputation_score: number;
  daily_budget_usdc: number;
  wallet_address?: string | null;
  wallet_balance_usdc: number;
  created_at: string;
  updated_at: string;
  killed_at?: string | null;
}

export interface OpenClawAgentCreateRequest {
  manifest: AgentManifest;
  daily_budget_usdc: number;
}

export interface OpenClawAgentStatusResponse {
  agent_id: string;
  status: "active" | "inactive" | "killed" | "paused_budget";
  reputation_score: number;
  wallet_balance_usdc: number;
  daily_budget_usdc: number;
  today_earnings_usdc: number;
  today_expenses_usdc: number;
}

export interface OpenClawBuyRequest {
  buyer_agent_id: string;
  seller_agent_id: string;
  service_description: string;
  amount_usdc: number;
  request_payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OpenClawBuyLegacyRequest {
  buyerAgentId?: string;
  buyer_id?: string;
  sellerAgentId?: string;
  seller_id?: string;
  description?: string;
  task_description?: string;
  amount?: number;
  price_usdc?: number;
  requestPayload?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export type OpenClawBuyInput = OpenClawBuyRequest | OpenClawBuyLegacyRequest;

export interface TransactionResponse {
  id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  amount_usdc: number;
  status:
    | "pending"
    | "payment_verified"
    | "completed"
    | "failed"
    | "refunded"
    | "disputed";
  tx_hash?: string | null;
  payment_tx_hash?: string | null;
  platform_fee_usdc: number;
  service_description: string;
  facilitator_tx_hash?: string | null;
  payment_method: string;
  task_input?: Record<string, unknown> | null;
  task_result?: Record<string, unknown> | null;
  execution_status?:
    | "pending_execution"
    | "executing"
    | "completed"
    | "failed"
    | null;
  execution_started_at?: string | null;
  execution_completed_at?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface OpenClawTransactionSummary {
  id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  amount_usdc: number;
  status:
    | "pending"
    | "payment_verified"
    | "completed"
    | "failed"
    | "refunded"
    | "disputed";
  service_description: string;
  created_at: string;
  completed_at?: string | null;
}

export interface DiscoveryResult {
  agent_id: string;
  manifest: AgentManifest;
  reputation_score: number;
  owner_id: string;
  distance: number;
}

export interface DiscoverParams {
  query: string;
  limit?: number;
  min_reputation?: number;
  max_cost_usdc?: number;
  service_type?: string;
}

export interface ConfirmRequest {
  action: "buy" | "kill";
  summary: string;
  payload: unknown;
}

export interface VerifyWebhookInput {
  signatureHeader: string;
  rawBody: string;
  now?: Date;
}

export interface VerifiedWebhook {
  timestamp: number;
  eventId: string;
  signature: string;
}

export interface AIBazaaOpenClawClientConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret?: string;
  requestTimeoutMs?: number;
  maxWebhookSkewSeconds?: number;
  replayTtlSeconds?: number;
  confirmAction?: (request: ConfirmRequest) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

interface ApiErrorPayload {
  detail?: string;
  message?: string;
  [key: string]: unknown;
}

export class AIBazaaClientError extends Error {
  statusCode: number;
  userMessage: string;
  apiPayload?: ApiErrorPayload;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      userMessage?: string;
      apiPayload?: ApiErrorPayload;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AIBazaaClientError";
    this.statusCode = options?.statusCode ?? 0;
    this.userMessage = options?.userMessage ?? message;
    this.apiPayload = options?.apiPayload;
  }
}

export class AIBazaaOpenClawClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookSecret?: string;
  private readonly requestTimeoutMs: number;
  private readonly maxWebhookSkewSeconds: number;
  private readonly replayTtlSeconds: number;
  private readonly confirmAction?: (
    request: ConfirmRequest,
  ) => Promise<boolean>;
  private readonly fetchImpl: typeof fetch;
  private readonly replayCache = new Map<string, number>();

  constructor(config: AIBazaaOpenClawClientConfig) {
    const normalizedBaseUrl = config.baseUrl.trim().replace(/\/$/, "");
    if (!normalizedBaseUrl) {
      throw new AIBazaaClientError("baseUrl is required");
    }
    if (!config.apiKey?.startsWith("ak_oc_")) {
      throw new AIBazaaClientError(
        "OpenClaw API key is invalid; expected ak_oc_ prefix",
      );
    }

    this.baseUrl = normalizedBaseUrl;
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 15_000;
    this.maxWebhookSkewSeconds = config.maxWebhookSkewSeconds ?? 300;
    this.replayTtlSeconds = config.replayTtlSeconds ?? 600;
    this.confirmAction = config.confirmAction;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async discover(params: DiscoverParams): Promise<DiscoveryResult[]> {
    const query = new URLSearchParams({ query: params.query });
    if (params.limit !== undefined) {
      query.set("limit", String(params.limit));
    }
    if (params.min_reputation !== undefined) {
      query.set("min_reputation", String(params.min_reputation));
    }
    if (params.max_cost_usdc !== undefined) {
      query.set("max_cost_usdc", String(params.max_cost_usdc));
    }
    if (params.service_type) {
      query.set("service_type", params.service_type);
    }
    return this.request<DiscoveryResult[]>(
      `/api/v1/openclaw/discover?${query.toString()}`,
    );
  }

  async deploy(payload: OpenClawAgentCreateRequest): Promise<AgentResponse> {
    return this.request<AgentResponse>("/api/v1/openclaw/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async status(agentId: string): Promise<OpenClawAgentStatusResponse> {
    return this.request<OpenClawAgentStatusResponse>(
      `/api/v1/openclaw/agents/${encodeURIComponent(agentId)}/status`,
    );
  }

  async buy(payload: OpenClawBuyInput): Promise<TransactionResponse> {
    const normalizedPayload = this.normalizeBuyPayload(payload);

    await this.requireConfirmation({
      action: "buy",
      summary: `Buy service for ${normalizedPayload.amount_usdc} USDC from ${normalizedPayload.seller_agent_id} using ${normalizedPayload.buyer_agent_id}`,
      payload: normalizedPayload,
    });

    return this.request<TransactionResponse>("/api/v1/openclaw/buy", {
      method: "POST",
      body: JSON.stringify(normalizedPayload),
    });
  }

  async buyValidated(payload: OpenClawBuyInput): Promise<TransactionResponse> {
    return this.buy(payload);
  }

  async transactions(limit = 20): Promise<OpenClawTransactionSummary[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    return this.request<OpenClawTransactionSummary[]>(
      `/api/v1/openclaw/transactions?${query.toString()}`,
    );
  }

  async transactionStatus(transactionId: string): Promise<TransactionResponse> {
    return this.request<TransactionResponse>(
      `/api/v1/openclaw/transactions/${encodeURIComponent(transactionId)}`,
    );
  }

  async kill(agentId: string): Promise<{ status: "success" }> {
    await this.requireConfirmation({
      action: "kill",
      summary: `Kill agent ${agentId}. This immediately deactivates the agent.`,
      payload: { agent_id: agentId },
    });

    return this.request<{ status: "success" }>(
      `/api/v1/openclaw/agents/${encodeURIComponent(agentId)}/kill`,
      {
        method: "POST",
      },
    );
  }

  verifyWebhook(input: VerifyWebhookInput): VerifiedWebhook {
    if (!this.webhookSecret) {
      throw new AIBazaaClientError(
        "webhookSecret is required to verify webhook signatures",
      );
    }

    const parsed = this.parseSignatureHeader(input.signatureHeader);
    const now = input.now ?? new Date();
    const nowTs = Math.floor(now.getTime() / 1000);

    if (Math.abs(nowTs - parsed.timestamp) > this.maxWebhookSkewSeconds) {
      throw new AIBazaaClientError(
        "Webhook timestamp outside allowed clock skew window",
      );
    }

    this.pruneReplayCache(nowTs);
    if (this.replayCache.has(parsed.eventId)) {
      throw new AIBazaaClientError("Replay detected for webhook event");
    }

    const signedPayload = `${parsed.timestamp}.${parsed.eventId}.${input.rawBody}`;
    const expected = createHmac("sha256", this.webhookSecret)
      .update(signedPayload, "utf8")
      .digest("hex");

    const isValid = this.constantTimeEqual(expected, parsed.signature);
    if (!isValid) {
      throw new AIBazaaClientError("Invalid webhook signature");
    }

    this.replayCache.set(parsed.eventId, nowTs + this.replayTtlSeconds);

    return {
      timestamp: parsed.timestamp,
      eventId: parsed.eventId,
      signature: parsed.signature,
    };
  }

  private parseSignatureHeader(headerValue: string): {
    timestamp: number;
    eventId: string;
    signature: string;
  } {
    const entries = headerValue.split(",").map((part) => part.trim());
    const map = new Map<string, string>();

    for (const entry of entries) {
      const [key, value] = entry.split("=", 2);
      if (key && value) {
        map.set(key, value);
      }
    }

    const timestampRaw = map.get("t");
    const eventId = map.get("id");
    const signature = map.get("v1");

    if (!timestampRaw || !eventId || !signature) {
      throw new AIBazaaClientError("Malformed webhook signature header");
    }

    const timestamp = Number.parseInt(timestampRaw, 10);
    if (Number.isNaN(timestamp)) {
      throw new AIBazaaClientError("Invalid webhook timestamp value");
    }

    return { timestamp, eventId, signature };
  }

  private pruneReplayCache(nowTs: number): void {
    for (const [eventId, expiryTs] of this.replayCache.entries()) {
      if (expiryTs <= nowTs) {
        this.replayCache.delete(eventId);
      }
    }
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a, "utf8");
    const bBuffer = Buffer.from(b, "utf8");
    if (aBuffer.length !== bBuffer.length) {
      return false;
    }
    return timingSafeEqual(aBuffer, bBuffer);
  }

  private async requireConfirmation(request: ConfirmRequest): Promise<void> {
    if (!this.confirmAction) {
      throw new AIBazaaClientError(
        `${request.action} requires explicit confirmation callback`,
      );
    }

    const approved = await this.confirmAction(request);
    if (!approved) {
      throw new AIBazaaClientError(
        `${request.action} was cancelled by user confirmation policy`,
      );
    }
  }

  private normalizeBuyPayload(payload: OpenClawBuyInput): OpenClawBuyRequest {
    const raw = payload as Record<string, unknown>;

    const buyerAgentId = this.pickFirstString(
      raw.buyer_agent_id,
      raw.buyerAgentId,
      raw.buyer_id,
    );
    const sellerAgentId = this.pickFirstString(
      raw.seller_agent_id,
      raw.sellerAgentId,
      raw.seller_id,
    );

    const requestPayload = this.pickFirstObject(
      raw.request_payload,
      raw.requestPayload,
      raw.payload,
    );

    let serviceDescription = this.pickFirstString(
      raw.service_description,
      raw.description,
      raw.task_description,
    );

    if (!serviceDescription && requestPayload) {
      serviceDescription = this.pickFirstString(
        requestPayload.description,
        requestPayload.task_description,
        requestPayload.prompt,
        requestPayload.notes,
        requestPayload.text,
        requestPayload.code,
      );
    }

    const rawAmount =
      (raw.amount_usdc as number | string | undefined) ??
      (raw.amount as number | string | undefined) ??
      (raw.price_usdc as number | string | undefined);

    const amountUsdc =
      typeof rawAmount === "number" ? rawAmount : Number(rawAmount);

    if (!buyerAgentId) {
      throw new AIBazaaClientError("buyer_agent_id is required", {
        userMessage: "Buy request is missing buyer agent id.",
      });
    }
    if (!sellerAgentId) {
      throw new AIBazaaClientError("seller_agent_id is required", {
        userMessage: "Buy request is missing seller agent id.",
      });
    }
    if (!serviceDescription) {
      throw new AIBazaaClientError("service_description is required", {
        userMessage:
          "Buy request is missing service description. Provide service_description or description.",
      });
    }
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      throw new AIBazaaClientError("amount_usdc must be a positive number", {
        userMessage: "Buy request amount must be a positive USDC value.",
      });
    }

    return {
      buyer_agent_id: buyerAgentId,
      seller_agent_id: sellerAgentId,
      service_description: serviceDescription,
      amount_usdc: amountUsdc,
      request_payload: requestPayload,
      metadata: this.pickFirstObject(raw.metadata, raw.meta),
    };
  }

  private pickFirstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private pickFirstObject(
    ...values: unknown[]
  ): Record<string, unknown> | undefined {
    for (const value of values) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return undefined;
  }

  private async request<T>(
    path: string,
    init?: Omit<RequestInit, "headers"> & {
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });

      if (!response.ok) {
        const payload = await this.safeParseErrorPayload(response);
        throw this.buildError(response.status, payload);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof AIBazaaClientError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AIBazaaClientError("AIBazaa request timed out", {
          userMessage: "AIBazaa API timed out. Please retry in a few seconds.",
          cause: error,
        });
      }

      throw new AIBazaaClientError("AIBazaa request failed", {
        userMessage:
          "Failed to reach AIBazaa API. Check network connectivity and base URL.",
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async safeParseErrorPayload(
    response: Response,
  ): Promise<ApiErrorPayload | undefined> {
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      if (payload && typeof payload === "object") {
        return payload;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private buildError(
    statusCode: number,
    payload?: ApiErrorPayload,
  ): AIBazaaClientError {
    const detail = payload?.detail || payload?.message;
    const detailText = typeof detail === "string" ? detail : "";

    if (statusCode === 401) {
      if (
        detailText.includes("MCP transport token cannot be used") ||
        detailText.includes("Unsupported token for /api/v1/agents/status")
      ) {
        return new AIBazaaClientError("OpenClaw token/endpoint mismatch", {
          statusCode,
          userMessage:
            "Auth token type does not match the endpoint. Use ak_oc_* on /api/v1/openclaw/... and ocmcp_* only on /mcp/sse or /mcp/ws.",
          apiPayload: payload,
        });
      }

      if (detailText.includes("Invalid or expired ocmcp_ token")) {
        return new AIBazaaClientError("OpenClaw MCP token expired or invalid", {
          statusCode,
          userMessage:
            "MCP token is invalid or expired. Mint a new token via POST /api/v1/auth/openclaw/mcp-token.",
          apiPayload: payload,
        });
      }

      return new AIBazaaClientError("OpenClaw API key is invalid or expired", {
        statusCode,
        userMessage:
          "Authentication failed. Reconnect AIBazaa in OpenClaw, refresh your API key, keep baseUrl on https://api.aibazaa.com, and restart the runtime to clear stale credentials.",
        apiPayload: payload,
      });
    }

    if (statusCode === 403) {
      return new AIBazaaClientError("OpenClaw key scope denied request", {
        statusCode,
        userMessage:
          "Permission denied for this action. Update OpenClaw connection scopes.",
        apiPayload: payload,
      });
    }

    if (statusCode === 404) {
      return new AIBazaaClientError(
        detail || "Requested resource was not found",
        {
          statusCode,
          userMessage:
            "The requested agent or resource was not found in your AIBazaa account.",
          apiPayload: payload,
        },
      );
    }

    if (statusCode === 409) {
      return new AIBazaaClientError(
        detail || "State conflict while processing request",
        {
          statusCode,
          userMessage:
            "AIBazaa rejected this action because resource state changed. Refresh and retry.",
          apiPayload: payload,
        },
      );
    }

    if (statusCode === 429) {
      return new AIBazaaClientError("OpenClaw key hit AIBazaa rate limit", {
        statusCode,
        userMessage: "Rate limit reached. Wait briefly, then retry.",
        apiPayload: payload,
      });
    }

    if (statusCode >= 500) {
      return new AIBazaaClientError(detail || "AIBazaa internal server error", {
        statusCode,
        userMessage: "AIBazaa is temporarily unavailable. Retry shortly.",
        apiPayload: payload,
      });
    }

    return new AIBazaaClientError(detail || "AIBazaa request failed", {
      statusCode,
      userMessage:
        detail || "Request could not be completed. Review input and retry.",
      apiPayload: payload,
    });
  }
}


