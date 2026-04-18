#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseUnits
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import escrowAbi from "../contracts/QuotaDEXEscrow.abi.json" with { type: "json" };

const DEFAULT_GATEWAY_BASE_URL = "http://localhost:3000";
const DEFAULT_CAPABILITY = "llama-3";
const DEFAULT_PROMPT = "hello from buyer demo";
const DEFAULT_RESULT_TIMEOUT_MS = 30_000;
const DEFAULT_PYUSD_DECIMALS = 6;
const POLL_INTERVAL_MS = 1_000;
const SUPPORTED_PAYMENT_MODES = new Set(["mock", "chain", "facilitator"]);

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable"
  }
];

function requireEnv(name) {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function formatGatewayFailure(response, fallbackMessage) {
  const detailLines = [];
  const payload = response?.payload;

  if (typeof payload?.error === "string" && payload.error.trim() !== "") {
    detailLines.push(`error=${payload.error}`);
  }

  if (typeof payload?.code === "string" && payload.code.trim() !== "") {
    detailLines.push(`code=${payload.code}`);
  }

  if (payload?.details && typeof payload.details === "object") {
    try {
      detailLines.push(`details=${JSON.stringify(payload.details)}`);
    } catch {
      detailLines.push("details=[unserializable]");
    }
  }

  return detailLines.length > 0
    ? `${fallbackMessage} ${detailLines.join(" | ")}`
    : fallbackMessage;
}

function getBuyerConfig() {
  const gatewayBaseUrl =
    process.env.GATEWAY_BASE_URL?.trim() || DEFAULT_GATEWAY_BASE_URL;
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const capability = process.env.BUYER_CAPABILITY?.trim() || DEFAULT_CAPABILITY;
  const prompt = process.env.BUYER_PROMPT?.trim() || DEFAULT_PROMPT;
  const resultTimeoutMs = Number.parseInt(
    process.env.BUYER_RESULT_TIMEOUT_MS ?? `${DEFAULT_RESULT_TIMEOUT_MS}`,
    10
  );
  const requestedPaymentMode = process.env.BUYER_PAYMENT_MODE?.trim().toLowerCase();
  const buyerPrivateKey = process.env.BUYER_PRIVATE_KEY?.trim();

  if (requestedPaymentMode && !SUPPORTED_PAYMENT_MODES.has(requestedPaymentMode)) {
    throw new Error(
      `BUYER_PAYMENT_MODE must be one of: ${Array.from(SUPPORTED_PAYMENT_MODES).join(", ")}.`
    );
  }

  if (requestedPaymentMode === "facilitator") {
    return {
      gatewayBaseUrl,
      supabaseUrl,
      supabaseAnonKey,
      buyerId: process.env.BUYER_ID?.trim() || "buyer-demo",
      capability,
      prompt,
      resultTimeoutMs,
      paymentMode: "facilitator",
      xPayment: requireEnv("BUYER_X_PAYMENT")
    };
  }

  if (requestedPaymentMode === "chain" || (!requestedPaymentMode && buyerPrivateKey)) {
    if (!buyerPrivateKey) {
      throw new Error("BUYER_PRIVATE_KEY is required when BUYER_PAYMENT_MODE=chain.");
    }

    const account = privateKeyToAccount(
      buyerPrivateKey.startsWith("0x") ? buyerPrivateKey : `0x${buyerPrivateKey}`
    );
    const buyerId = process.env.BUYER_ID?.trim() || account.address;

    if (buyerId.toLowerCase() !== account.address.toLowerCase()) {
      throw new Error("BUYER_ID must match BUYER_PRIVATE_KEY address in chain mode.");
    }

    return {
      gatewayBaseUrl,
      supabaseUrl,
      supabaseAnonKey,
      buyerId,
      capability,
      prompt,
      resultTimeoutMs,
      paymentMode: "chain",
      buyerPrivateKey:
        buyerPrivateKey.startsWith("0x") ? buyerPrivateKey : `0x${buyerPrivateKey}`,
      kiteRpcUrl: requireEnv("KITE_RPC_URL"),
      pyusdContractAddress: requireEnv("PYUSD_CONTRACT_ADDRESS"),
      escrowContractAddress: requireEnv("ESCROW_CONTRACT_ADDRESS"),
      pyusdDecimals: Number.parseInt(
        process.env.PYUSD_DECIMALS ?? `${DEFAULT_PYUSD_DECIMALS}`,
        10
      )
    };
  }

  return {
    gatewayBaseUrl,
    supabaseUrl,
    supabaseAnonKey,
    buyerId: process.env.BUYER_ID?.trim() || "buyer-demo",
    capability,
    prompt,
    resultTimeoutMs,
    paymentMode: "mock"
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

  console.log("[buyer] quote accepts summary", {
    mode: config.paymentMode,
    accepts_count: Array.isArray(response.payload.accepts)
      ? response.payload.accepts.length
      : 0,
    facilitator_pay_to: response.payload.accepts?.[0]?.payTo ?? null,
    facilitator_asset: response.payload.accepts?.[0]?.asset ?? null
  });

  return response.payload;
}

function buildMockTxHash() {
  const hex = Date.now().toString(16).padStart(8, "0");
  return `0x${hex}abc123`;
}

function requireAddress(value, label) {
  if (!isAddress(value)) {
    throw new Error(`${label} must be a valid EVM address.`);
  }

  return value;
}

function toPaymentIdBytes32(paymentId) {
  const normalized = paymentId.startsWith("0x") ? paymentId : `0x${paymentId}`;

  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error("payment_id must be a 32-byte hex string.");
  }

  return normalized;
}

async function createChainPayment(config, quote) {
  const account = privateKeyToAccount(config.buyerPrivateKey);
  const publicClient = createPublicClient({
    transport: http(config.kiteRpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    transport: http(config.kiteRpcUrl)
  });
  const escrowAddress = requireAddress(
    config.escrowContractAddress,
    "ESCROW_CONTRACT_ADDRESS"
  );
  const quoteEscrowAddress = requireAddress(quote.pay_to, "quote.pay_to");
  const tokenAddress = requireAddress(
    config.pyusdContractAddress,
    "PYUSD_CONTRACT_ADDRESS"
  );
  const sellerAddress = requireAddress(quote.seller_id, "quote.seller_id");
  const paymentId = toPaymentIdBytes32(quote.payment_id ?? quote.fingerprint);

  if (quoteEscrowAddress.toLowerCase() !== escrowAddress.toLowerCase()) {
    throw new Error("Quote escrow address does not match ESCROW_CONTRACT_ADDRESS.");
  }

  const amount = parseUnits(quote.amount, config.pyusdDecimals);
  const approvalTxHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [escrowAddress, amount]
  });

  await publicClient.waitForTransactionReceipt({
    hash: approvalTxHash
  });

  const depositTxHash = await walletClient.writeContract({
    address: escrowAddress,
    abi: escrowAbi,
    functionName: "deposit",
    args: [paymentId, sellerAddress, amount]
  });

  await publicClient.waitForTransactionReceipt({
    hash: depositTxHash
  });

  return {
    txHash: depositTxHash,
    approvalTxHash
  };
}

async function verifyPayment(config, quote) {
  const paymentResult =
    config.paymentMode === "chain"
      ? await createChainPayment(config, quote)
      : config.paymentMode === "facilitator"
        ? {
            txHash: null,
            approvalTxHash: null,
            xPayment: config.xPayment
          }
        : {
            txHash: buildMockTxHash(),
            approvalTxHash: null,
            xPayment: null
          };
  const response = await gatewayJsonRequest(
    config.gatewayBaseUrl,
    "/api/v1/jobs/verify",
    {
      method: "POST",
      headers: paymentResult.xPayment
        ? {
            "x-payment": paymentResult.xPayment
          }
        : undefined,
      body: JSON.stringify({
        fingerprint: quote.fingerprint,
        tx_hash: paymentResult.txHash,
        payload: {
          buyer_id: config.buyerId,
          capability: config.capability,
          prompt: config.prompt
        }
      })
    }
  );

  if (!response.ok || !response.payload) {
    throw new Error(formatGatewayFailure(response, `Verify failed with status ${response.status}.`));
  }

  return {
    txHash: paymentResult.txHash,
    approvalTxHash: paymentResult.approvalTxHash,
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

  console.log("[buyer] starting run", {
    mode: config.paymentMode,
    buyer_id: config.buyerId,
    capability: config.capability,
    facilitator_x_payment_supplied:
      config.paymentMode === "facilitator" ? Boolean(config.xPayment) : false
  });

  const quote = await requestQuote(config);
  console.log("[buyer] quote received", quote);

  const { txHash, approvalTxHash, job } = await verifyPayment(config, quote);
  console.log("[buyer] payment verified", {
    mode: config.paymentMode,
    approval_tx_hash: approvalTxHash,
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
