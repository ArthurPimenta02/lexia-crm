import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { validateLote2RedisTarget } from "./lib/lote2-isolated-target.mjs";

const environmentFile =
  process.env.LEXIA_LOTE2_ENV_FILE?.trim() || ".env.lote2.test.local";
if (existsSync(".env.local")) loadEnvFile(".env.local");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

let target;
try {
  target = validateLote2RedisTarget({
    confirmation: process.env.LEXIA_LOTE2_REDIS_CONFIRM,
    environment: process.env.LEXIA_LOTE2_ENVIRONMENT,
    expectedHost: process.env.LEXIA_LOTE2_REDIS_EXPECTED_HOST,
    legacyMirandaRedisUrl: process.env.MIRANDA_UPSTASH_REDIS_REST_URL,
    productionRedisUrl: process.env.LEXIA_PRODUCTION_REDIS_REST_URL,
    protectedRedisUrls: process.env.LEXIA_PROTECTED_REDIS_REST_URLS,
    redisUrl: process.env.LEXIA_LOTE2_UPSTASH_REDIS_REST_URL,
    requireEmpty: process.env.LEXIA_LOTE2_REDIS_REQUIRE_EMPTY,
    token: process.env.LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid Redis target.");
  process.exit(2);
}

async function runReadCommand(command) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.LEXIA_LOTE2_UPSTASH_REDIS_REST_TOKEN}`,
        "content-type": "application/json",
        "user-agent": "codex-lote2-harness",
      },
      body: JSON.stringify(command),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error("Redis rejected the read-only command.");
    return payload?.result;
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const pong = await runReadCommand(["PING"]);
  const size = await runReadCommand(["DBSIZE"]);
  if (pong !== "PONG") throw new Error("Redis PING returned an unexpected response.");
  if (!Number.isInteger(size) || size < 0) {
    throw new Error("Redis DBSIZE returned an unexpected response.");
  }
  if (target.requireEmpty && size !== 0) {
    throw new Error("Redis is not empty; isolated initialization was refused.");
  }

  console.log("Lot 2 Upstash connectivity and authentication succeeded.");
  console.log(`Host: ${target.host}`);
  console.log(`Environment: ${target.environment}`);
  console.log(`Existing keys: ${size}`);
  console.log("Redis write commands executed: 0");
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    console.error("The Redis connectivity check timed out.");
  } else {
    console.error(error instanceof Error ? error.message : "Redis connectivity failed.");
  }
  process.exit(1);
}
