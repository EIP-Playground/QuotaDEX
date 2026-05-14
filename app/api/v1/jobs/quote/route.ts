import { NextResponse } from "next/server";
import {
  badRequestResponse,
  internalServerErrorResponse,
  serviceUnavailableResponse
} from "@/lib/errors";
import {
  buildX402AcceptEntry,
  buildX402PaymentRequiredResponse
} from "@/lib/chain/facilitator";
import { toOnChainAmount } from "@/lib/chain/escrow";
import { getServerEnv } from "@/lib/env";
import { buildFingerprint } from "@/lib/fingerprint";
import {
  getNetworkProfile,
  NetworkProfileConfigError
} from "@/lib/network-profiles";
import {
  buildQuoteContext,
  buildQuoteContextKey,
  parseQuoteRequestBody,
  QUOTE_CONTEXT_TTL_SECONDS,
  QUOTE_PAYMENT_MODE,
  releaseReservedSeller,
  type ReservedSeller,
  reserveSellerForQuote
} from "@/lib/jobs";
import { createRedisClient } from "@/lib/redis";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Request body must be valid JSON.", "INVALID_JSON");
  }

  let quoteRequest: ReturnType<typeof parseQuoteRequestBody>;

  try {
    quoteRequest = parseQuoteRequestBody(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid quote request body.",
      "INVALID_REQUEST"
    );
  }

  let env: ReturnType<typeof getServerEnv>;
  let networkProfile: ReturnType<typeof getNetworkProfile>;

  try {
    env = getServerEnv();
    networkProfile = getNetworkProfile(env, quoteRequest.network_profile ?? "live-mainnet");
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for quote.",
      "GATEWAY_CONFIG_MISSING",
      {
        code: error instanceof NetworkProfileConfigError ? error.code : undefined,
        reason: error instanceof Error ? error.message : "Unknown config error."
      }
    );
  }

  let reservedSeller: ReservedSeller | null = null;

  try {
    reservedSeller = await reserveSellerForQuote(
      quoteRequest.capability,
      networkProfile.id
    );
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to reserve a seller for quote.",
      "QUOTE_RESERVE_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown reserve error." }
    );
  }

  if (!reservedSeller) {
    return serviceUnavailableResponse(
      "No available seller.",
      "NO_SELLER_AVAILABLE"
    );
  }

  const fingerprint = buildFingerprint({
    buyerId: quoteRequest.buyer_id,
    capability: quoteRequest.capability,
    prompt: quoteRequest.prompt,
    networkProfile: networkProfile.id
  }, env.GATEWAY_SALT);
  const paymentId = fingerprint;
  const tokenDecimals = Number.parseInt(networkProfile.paymentTokenDecimals, 10);
  const amountAtomic = toOnChainAmount(
    reservedSeller.price_per_task,
    tokenDecimals
  ).toString();
  const quoteContext = buildQuoteContext({
    payment_id: paymentId,
    fingerprint,
    buyer_id: quoteRequest.buyer_id,
    seller_id: reservedSeller.id,
    seller_reserved_at: reservedSeller.reserved_at,
    capability: quoteRequest.capability,
    amount: reservedSeller.price_per_task,
    amount_atomic: amountAtomic,
    currency: networkProfile.paymentCurrency,
    payment_mode: QUOTE_PAYMENT_MODE,
    payment_asset: networkProfile.paymentAssetAddress,
    pay_to: networkProfile.escrowContractAddress,
    network_profile: networkProfile.id,
    network: networkProfile.network,
    chain_id: networkProfile.chainId
  });

  try {
    const redis = createRedisClient();
    await redis.set(
      buildQuoteContextKey(paymentId),
      JSON.stringify(quoteContext),
      { ex: QUOTE_CONTEXT_TTL_SECONDS }
    );
  } catch (error) {
    try {
      await releaseReservedSeller(reservedSeller.id, networkProfile.id);
    } catch (releaseError) {
      console.error("Failed to release seller after quote Redis write failure", {
        sellerId: reservedSeller.id,
        reason:
          releaseError instanceof Error ? releaseError.message : "Unknown release error."
      });
    }

    return internalServerErrorResponse(
      "Failed to store quote context.",
      "QUOTE_CONTEXT_STORE_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown Redis write error." }
    );
  }

  const supabase = createServerSupabaseClient();
  const { error: eventError } = await supabase.from("events").insert({
    network_profile: networkProfile.id,
    type: "MATCHING",
    message: `Reserved seller ${reservedSeller.id} for capability ${quoteRequest.capability} and payment ${paymentId}.`
  });

  if (eventError) {
    console.error("Failed to log quote matching event", {
      paymentId,
      sellerId: reservedSeller.id,
      reason: eventError.message
    });
  }

  const accepts = [
    buildX402AcceptEntry({
      asset: networkProfile.paymentAssetAddress,
      payTo: networkProfile.escrowContractAddress,
      maxAmountRequired: amountAtomic,
      resource: new URL("/api/v1/jobs/verify", networkProfile.publicBaseUrl).toString(),
      description: `QuotaDEX ${quoteRequest.capability} execution request`,
      merchantName: "QuotaDEX Gateway",
      network: networkProfile.network,
      outputSchema: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          status: { type: "string" }
        },
        required: ["job_id", "status"]
      },
      extra: {
        payment_id: paymentId,
        payment_mode: QUOTE_PAYMENT_MODE,
        seller_id: reservedSeller.id,
        network_profile: networkProfile.id,
        escrow_contract: networkProfile.escrowContractAddress,
        currency: networkProfile.paymentCurrency,
        amount_atomic: amountAtomic,
        chain_id: networkProfile.chainId
      }
    })
  ];
  const x402Payload = buildX402PaymentRequiredResponse({
    accepts,
    error: "Payment Required"
  });

  return NextResponse.json(
    {
      error: "Payment Required",
      code: "PAYMENT_REQUIRED",
      payment_id: paymentId,
      fingerprint,
      payment_mode: QUOTE_PAYMENT_MODE,
      network_profile: networkProfile.id,
      pay_to: networkProfile.escrowContractAddress,
      amount: reservedSeller.price_per_task,
      amount_atomic: amountAtomic,
      currency: networkProfile.paymentCurrency,
      network: networkProfile.network,
      chain_id: networkProfile.chainId,
      payment_asset: networkProfile.paymentAssetAddress,
      seller_id: reservedSeller.id,
      expires_in_seconds: QUOTE_CONTEXT_TTL_SECONDS,
      accepts: x402Payload.accepts,
      x402Version: x402Payload.x402Version
    },
    {
      status: 402
    }
  );
}
