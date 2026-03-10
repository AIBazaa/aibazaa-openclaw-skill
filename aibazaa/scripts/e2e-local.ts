import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  AIBazaaClientError,
  AIBazaaOpenClawClient,
  type DiscoverParams,
} from "../aibazaa-client.js";

type SkillConfig = {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  maxWebhookSkewSeconds?: number;
  replayTtlSeconds?: number;
  requestTimeoutMs?: number;
};

function parseArgs(): { configPath: string; query: string } {
  const configFlag = process.argv.find((arg) => arg.startsWith("--config="));
  const queryFlag = process.argv.find((arg) => arg.startsWith("--query="));

  const configPath =
    configFlag?.slice("--config=".length) ??
    path.resolve(process.cwd(), "config.json");
  const query = queryFlag?.slice("--query=".length) ?? "summarization";

  return { configPath, query };
}

async function loadConfig(filePath: string): Promise<SkillConfig> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as SkillConfig;
}

async function main(): Promise<void> {
  const { configPath, query } = parseArgs();
  const config = await loadConfig(configPath);

  const client = new AIBazaaOpenClawClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    webhookSecret: config.webhookSecret,
    maxWebhookSkewSeconds: config.maxWebhookSkewSeconds,
    replayTtlSeconds: config.replayTtlSeconds,
    requestTimeoutMs: config.requestTimeoutMs,
    confirmAction: async () => true,
  });

  const discoverParams: DiscoverParams = {
    query,
    limit: 3,
  };

  const matches = await client.discover(discoverParams);
  console.log("OpenClaw skill connectivity check succeeded");
  console.log(
    JSON.stringify(
      {
        baseUrl: config.baseUrl,
        query,
        resultCount: matches.length,
        topAgentIds: matches.map((match) => match.agent_id),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof AIBazaaClientError) {
    console.error(`E2E check failed: ${error.userMessage}`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
