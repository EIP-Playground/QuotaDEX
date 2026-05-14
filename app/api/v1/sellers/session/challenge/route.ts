import { NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse
} from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import {
  getNetworkProfile,
  NetworkProfileConfigError
} from "@/lib/network-profiles";
import { createSellerBondChallengeConfig } from "@/lib/seller-bond";
import { parseSellerIdentityBody } from "@/lib/sellers";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAddress, isAddress } from "viem";

type SellerChallengeRow = {
  id: string;
  proof_receiver_address: string;
  proof_token_symbol: string;
  amount_display: string;
  amount_atomic: string;
  expires_at: string;
};

function normalizeSellerAddress(value: string): string {
  if (!isAddress(value)) {
    throw new Error("seller_id must be a valid EVM address.");
  }

  return getAddress(value);
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Request body must be valid JSON.", "INVALID_JSON");
  }

  let sellerIdentity: ReturnType<typeof parseSellerIdentityBody>;

  try {
    sellerIdentity = parseSellerIdentityBody(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid seller challenge body.",
      "INVALID_REQUEST"
    );
  }

  if (!sellerIdentity.passport_agent_id) {
    return badRequestResponse(
      "passport_agent_id must be a non-empty string.",
      "INVALID_REQUEST"
    );
  }

  try {
    normalizeSellerAddress(sellerIdentity.seller_id);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid seller address.",
      "INVALID_REQUEST"
    );
  }

  let env: ReturnType<typeof getServerEnv>;
  let networkProfile: ReturnType<typeof getNetworkProfile>;

  try {
    env = getServerEnv();
    networkProfile = getNetworkProfile(env, sellerIdentity.network_profile);
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for seller bond challenge.",
      "GATEWAY_CONFIG_MISSING",
      {
        code: error instanceof NetworkProfileConfigError ? error.code : undefined,
        reason: error instanceof Error ? error.message : "Unknown config error."
      }
    );
  }

  let challengeConfig: ReturnType<typeof createSellerBondChallengeConfig>;

  try {
    challengeConfig = createSellerBondChallengeConfig({
      GATEWAY_PRIVATE_KEY: networkProfile.gatewayPrivateKey,
      KITE_PAYMENT_ASSET_ADDRESS: networkProfile.paymentAssetAddress,
      PAYMENT_CURRENCY: networkProfile.paymentCurrency,
      PAYMENT_TOKEN_DECIMALS: networkProfile.paymentTokenDecimals
    });
  } catch (error) {
    return internalServerErrorResponse(
      "Invalid seller bond challenge configuration.",
      "SELLER_BOND_CONFIG_INVALID",
      { reason: error instanceof Error ? error.message : "Unknown config error." }
    );
  }

  const supabase = createServerSupabaseClient();
  const { data: seller, error: readError } = await supabase
    .from("sellers")
    .select("id, approval_status")
    .eq("id", sellerIdentity.seller_id)
    .eq("network_profile", sellerIdentity.network_profile)
    .maybeSingle();

  if (readError) {
    return internalServerErrorResponse(
      "Failed to load seller for bond challenge.",
      "SELLER_READ_FAILED",
      { reason: readError.message }
    );
  }

  if (!seller) {
    return notFoundResponse("Seller not found.", "SELLER_NOT_FOUND");
  }

  const sellerRow = seller as { approval_status: string | null };

  if (sellerRow.approval_status && sellerRow.approval_status !== "approved") {
    return forbiddenResponse(
      "Seller is not approved for Gateway sessions.",
      "SELLER_NOT_APPROVED"
    );
  }

  const now = new Date().toISOString();
  const { data: challenge, error: insertError } = await supabase
    .from("seller_auth_challenges")
    .insert({
      seller_id: sellerIdentity.seller_id,
      network_profile: sellerIdentity.network_profile,
      passport_agent_id: sellerIdentity.passport_agent_id,
      proof_receiver_address: challengeConfig.receiverAddress,
      proof_token_address: challengeConfig.tokenAddress,
      proof_token_symbol: challengeConfig.tokenSymbol,
      amount_atomic: challengeConfig.amountAtomic,
      amount_display: challengeConfig.amountDisplay,
      status: "pending",
      expires_at: challengeConfig.expiresAt.toISOString(),
      created_at: now,
      updated_at: now
    })
    .select(
      "id, proof_receiver_address, proof_token_symbol, amount_display, amount_atomic, expires_at"
    )
    .single();

  if (insertError) {
    return internalServerErrorResponse(
      "Failed to create seller bond challenge.",
      "SELLER_BOND_CHALLENGE_CREATE_FAILED",
      { reason: insertError.message }
    );
  }

  const challengeRow = challenge as SellerChallengeRow;
  const kpassCommand = `kpass wallet send --to ${challengeRow.proof_receiver_address} --amount ${challengeRow.amount_display} --asset ${challengeRow.proof_token_symbol} --output json`;

  return NextResponse.json({
    status: "ok",
    challenge_id: challengeRow.id,
    seller_id: sellerIdentity.seller_id,
    network_profile: sellerIdentity.network_profile,
    network: networkProfile.network,
    chain_id: networkProfile.chainId,
    to: challengeRow.proof_receiver_address,
    asset: challengeRow.proof_token_symbol,
    amount: challengeRow.amount_display,
    amount_atomic: challengeRow.amount_atomic,
    expires_at: challengeRow.expires_at,
    kpass_command: kpassCommand
  });
}
