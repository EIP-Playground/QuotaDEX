#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const DEFAULT_GATEWAY_BASE_URL = "http://localhost:3000";
const DEFAULT_BUYER_ID = "buyer-demo";
const DEFAULT_CAPABILITY = "llama-3";
const DEFAULT_PROMPT = "hello from buyer demo";
const DEFAULT_RESULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

function requireEnv(name) {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getBuyerConfig() {
  return {
    gatewayBaseUrl:
      process.env.GATEWAY_BASE_URL?.trim() || DEFAULT_GATEWAY_BASE_URL,
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    buyerId: process.env.BUYER_ID?.trim() || DEFAULT_BUYER_ID,
    capability: process.env.BUYER_CAPABILITY?.trim() || DEFAULT_CAPABILITY,
    prompt: process.env.BUYER_PROMPT?.trim() || DEFAULT_PROMPT,
    resultTimeoutMs: Number.parseInt(
      process.env.BUYER_RESULT_TIMEOUT_MS ?? `${DEFAULT_RESULT_TIMEOUT_MS}`,
      10
    )
  };
}

async function gatewayJsonRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
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

  return {
    status: response.status,
    ok: response.ok,
    payload
  };
}

async function requestQuote(config) {
  const response = await gatewayJsonRequest(
    config.gatewayBaseUrl,
    "/api/v1/jobs/quote",
    {
      method: "POST",
      body: JSON.stringify({
        buyer_id: config.buyerId,
        capability: config.capability,
        prompt: config.prompt
      })
    }
  );

  if (response.status !== 402 || !response.payload) {
    throw new Error(
      `Expected HTTP 402 from quote, received ${response.status}.`
    );
  }

  return response.payload;
}

function buildMockTxHash() {
  const hex = Date.now().toString(16).padStart(8, "0");
  return `0x${hex}abc123`;
}

async function verifyPayment(config, quote) {
  const txHash = buildMockTxHash();
  const response = await gatewayJsonRequest(
    config.gatewayBaseUrl,
    "/api/v1/jobs/verify",
    {
      method: "POST",
      body: JSON.stringify({
        fingerprint: quote.fingerprint,
        tx_hash: txHash,
        payload: {
          buyer_id: config.buyerId,
          capability: config.capability,
          prompt: config.prompt
        }
      })
    }
  );

  if (!response.ok || !response.payload) {
    throw new Error(
      response.payload?.error ??
        `Verify failed with status ${response.status}.`
    );
  }

  return {
    txHash,
    job: response.payload
  };
}

async function fetchJob(config, jobId) {
  const response = await gatewayJsonRequest(
    config.gatewayBaseUrl,
    `/api/v1/jobs/${jobId}`,
    {
      method: "GET",
      headers: {}
    }
  );

  if (!response.ok || !response.payload) {
    throw new Error(
      response.payload?.error ?? `Failed to fetch job ${jobId}.`
    );
  }

  return response.payload;
}

async function waitForJobResult(config, jobId) {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    function finalize(handler, value) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      clearInterval(poller);
      void supabase.removeChannel(channel);
      handler(value);
    }

    const timeout = setTimeout(() => {
      finalize(reject, new Error(`Timed out waiting for job ${jobId}.`));
    }, config.resultTimeoutMs);

    const poller = setInterval(async () => {
      try {
        const job = await fetchJob(config, jobId);

        if (job.status === "done") {
          finalize(resolve, job);
          return;
        }

        if (job.status === "failed") {
          finalize(
            reject,
            new Error(
              typeof job.result?.error === "string"
                ? job.result.error
                : `Job ${jobId} failed.`
            )
          );
        }
      } catch (error) {
        finalize(reject, error);
      }
    }, POLL_INTERVAL_MS);

    const channel = supabase
      .channel(`buyer-job:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          const job = payload.new;

          if (job.status === "done") {
            finalize(resolve, {
              job_id: job.id,
              payment_id: job.payment_id,
              seller_id: job.seller_id,
              status: job.status,
              result: job.result
            });
            return;
          }

          if (job.status === "failed") {
            finalize(
              reject,
              new Error(
                typeof job.result?.error === "string"
                  ? job.result.error
                  : `Job ${job.id} failed.`
              )
            );
          }
        }
      )
      .subscribe();
  });
}

async function main() {
  const config = getBuyerConfig();

  const quote = await requestQuote(config);
  console.log("[buyer] quote received", quote);

  const { txHash, job } = await verifyPayment(config, quote);
  console.log("[buyer] mock payment verified", {
    tx_hash: txHash,
    job_id: job.job_id
  });

  const finalJob = await waitForJobResult(config, job.job_id);
  console.log("[buyer] final job result", finalJob);
}

main().catch((error) => {
  console.error("[buyer] fatal error", error);
  process.exit(1);
});
