import { createHmac } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AIBazaaClientError,
  AIBazaaOpenClawClient,
} from "../aibazaa-client.js";

function buildSignature(
  secret: string,
  timestamp: number,
  eventId: string,
  body: string,
): string {
  const signedPayload = `${timestamp}.${eventId}.${body}`;
  const sig = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return `t=${timestamp},id=${eventId},v1=${sig}`;
}

test("verifyWebhook accepts valid signature", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  const timestamp = Math.floor(now.getTime() / 1000);
  const eventId = "evt_abc123";
  const body = JSON.stringify({
    event_id: eventId,
    type: "transaction.completed",
  });

  const client = new AIBazaaOpenClawClient({
    baseUrl: "https://api.aibazaa.com",
    apiKey: "ak_oc_test_key_value",
    webhookSecret: "my-very-strong-webhook-secret",
    maxWebhookSkewSeconds: 300,
    replayTtlSeconds: 600,
  });

  const signatureHeader = buildSignature(
    "my-very-strong-webhook-secret",
    timestamp,
    eventId,
    body,
  );

  const result = client.verifyWebhook({
    signatureHeader,
    rawBody: body,
    now,
  });

  assert.equal(result.eventId, eventId);
  assert.equal(result.timestamp, timestamp);
});

test("verifyWebhook rejects replayed event id", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  const timestamp = Math.floor(now.getTime() / 1000);
  const eventId = "evt_replay_1";
  const body = JSON.stringify({ event_id: eventId, type: "budget.warning" });

  const client = new AIBazaaOpenClawClient({
    baseUrl: "https://api.aibazaa.com",
    apiKey: "ak_oc_test_key_value",
    webhookSecret: "my-very-strong-webhook-secret",
    maxWebhookSkewSeconds: 300,
    replayTtlSeconds: 600,
  });

  const signatureHeader = buildSignature(
    "my-very-strong-webhook-secret",
    timestamp,
    eventId,
    body,
  );

  client.verifyWebhook({
    signatureHeader,
    rawBody: body,
    now,
  });

  assert.throws(
    () =>
      client.verifyWebhook({
        signatureHeader,
        rawBody: body,
        now,
      }),
    (error) =>
      error instanceof AIBazaaClientError &&
      /Replay detected/.test(error.message),
  );
});

test("verifyWebhook rejects stale timestamp", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  const staleTimestamp = Math.floor(now.getTime() / 1000) - 301;
  const eventId = "evt_old";
  const body = JSON.stringify({
    event_id: eventId,
    type: "agent.status_changed",
  });

  const client = new AIBazaaOpenClawClient({
    baseUrl: "https://api.aibazaa.com",
    apiKey: "ak_oc_test_key_value",
    webhookSecret: "my-very-strong-webhook-secret",
    maxWebhookSkewSeconds: 300,
    replayTtlSeconds: 600,
  });

  const signatureHeader = buildSignature(
    "my-very-strong-webhook-secret",
    staleTimestamp,
    eventId,
    body,
  );

  assert.throws(
    () =>
      client.verifyWebhook({
        signatureHeader,
        rawBody: body,
        now,
      }),
    (error) =>
      error instanceof AIBazaaClientError &&
      /outside allowed clock skew/.test(error.message),
  );
});
