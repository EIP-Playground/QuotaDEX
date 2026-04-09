#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const DEFAULT_GATEWAY_BASE_URL = "http://localhost:3000";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;
const DEFAULT_SELLER_ID = "seller-demo";
const DEFAULT_CAPABILITY = "llama-3";
const DEFAULT_PRICE_PER_TASK = "0.01";

function requireEnv(name) {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getWorkerConfig() {
  return {
    gatewayBaseUrl:
      process.env.GATEWAY_BASE_URL?.trim() || DEFAULT_GATEWAY_BASE_URL,
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    sellerId: process.env.SELLER_ID?.trim() || DEFAULT_SELLER_ID,
    capability: process.env.SELLER_CAPABILITY?.trim() || DEFAULT_CAPABILITY,
    pricePerTask:
      process.env.SELLER_PRICE_PER_TASK?.trim() || DEFAULT_PRICE_PER_TASK,
    heartbeatIntervalMs: Number.parseInt(
      process.env.SELLER_HEARTBEAT_INTERVAL_MS ??
        `${DEFAULT_HEARTBEAT_INTERVAL_MS}`,
      10
    )
  };
}

async function gatewayPost(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {
        error: text
      };
    }
  }

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload.error === "string"
        ? payload.error
        : `${path} failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload;
}

async function selfCheck(config) {
  const probe = await runHandler({
    jobId: "self-check",
    capability: config.capability,
    prompt: "hello from self-check"
  });

  if (
    !probe ||
    typeof probe !== "object" ||
    typeof probe.text !== "string" ||
    probe.text.trim() === ""
  ) {
    throw new Error("Local seller self-check returned an empty result.");
  }
}

async function runHandler({ jobId, capability, prompt }) {
  return {
    text: `[${capability}] ${prompt}`,
    meta: {
      job_id: jobId,
      completed_at: new Date().toISOString()
    }
  };
}

function extractJobPrompt(job) {
  if (
    !job ||
    typeof job !== "object" ||
    !job.payload ||
    typeof job.payload !== "object" ||
    typeof job.payload.prompt !== "string"
  ) {
    throw new Error("Job payload.prompt is missing.");
  }

  return job.payload.prompt;
}

async function handleJob(config, activeJobs, job) {
  if (!job?.id || typeof job.id !== "string") {
    return;
  }

  if (job.status !== "paid") {
    return;
  }

  if (activeJobs.has(job.id)) {
    return;
  }

  activeJobs.add(job.id);

  try {
    await gatewayPost(config.gatewayBaseUrl, `/api/v1/jobs/${job.id}/start`, {
      seller_id: config.sellerId
    });

    const result = await runHandler({
      jobId: job.id,
      capability: config.capability,
      prompt: extractJobPrompt(job)
    });

    await gatewayPost(
      config.gatewayBaseUrl,
      `/api/v1/jobs/${job.id}/complete`,
      {
        seller_id: config.sellerId,
        result
      }
    );

    console.log(`[worker] completed job ${job.id}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown worker error.";

    console.error(`[worker] job ${job.id} failed`, errorMessage);

    try {
      await gatewayPost(config.gatewayBaseUrl, `/api/v1/jobs/${job.id}/fail`, {
        seller_id: config.sellerId,
        error: errorMessage
      });
    } catch (failError) {
      console.error(
        `[worker] failed to report job failure for ${job.id}`,
        failError
      );
    }
  } finally {
    activeJobs.delete(job.id);
  }
}

async function main() {
  const config = getWorkerConfig();
  const activeJobs = new Set();

  await selfCheck(config);
  console.log("[worker] self-check passed");

  await gatewayPost(config.gatewayBaseUrl, "/api/v1/sellers/register", {
    seller_id: config.sellerId,
    capability: config.capability,
    price_per_task: config.pricePerTask,
    wallet: config.sellerId
  });
  console.log("[worker] seller registered");

  const heartbeatTimer = setInterval(async () => {
    try {
      await gatewayPost(config.gatewayBaseUrl, "/api/v1/sellers/heartbeat", {
        seller_id: config.sellerId
      });
    } catch (error) {
      console.error("[worker] heartbeat failed", error);
    }
  }, config.heartbeatIntervalMs);

  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const channel = supabase
    .channel(`seller-jobs:${config.sellerId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "jobs",
        filter: `seller_id=eq.${config.sellerId}`
      },
      async (payload) => {
        await handleJob(config, activeJobs, payload.new);
      }
    )
    .subscribe((status) => {
      console.log(`[worker] realtime status: ${status}`);
    });

  async function shutdown(signal) {
    console.log(`[worker] shutting down on ${signal}`);
    clearInterval(heartbeatTimer);

    try {
      await gatewayPost(config.gatewayBaseUrl, "/api/v1/sellers/offline", {
        seller_id: config.sellerId
      });
    } catch (error) {
      console.error("[worker] failed to mark seller offline", error);
    }

    await supabase.removeChannel(channel);
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  console.log(
    `[worker] listening for jobs as ${config.sellerId} on ${config.gatewayBaseUrl}`
  );
}

main().catch((error) => {
  console.error("[worker] fatal error", error);
  process.exit(1);
});
