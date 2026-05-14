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
  NetworkProfileConfigError,
  parseNetworkProfileId,
  type NetworkProfileId
} from "@/lib/network-profiles";
import {
  PassportAuthError,
  verifyPassportBearerToken
} from "@/lib/passport-auth";
import {
  createSellerRenewalToken,
  hashSellerRenewalToken,
  verifySellerRenewalToken
} from "@/lib/seller-renewal-token";
import {
  SellerBondReceiptError,
  verifySellerBondTransferReceipt
} from "@/lib/seller-bond";
import { createSellerSessionToken, readBearerToken } from "@/lib/seller-session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAddress, isAddress } from "viem";

type SellerSessionRequest = {
  seller_id: string;
  passport_agent_id: string;
  network_profile: NetworkProfileId;
  challenge_id?: string;
  tx_hash?: string;
  seller_renewal_token?: string;
};

type SellerSessionRow = {
  id: string;
  passport_agent_id: string | null;
  passport_payer_addr: string | null;
  passport_subject: string | null;
  passport_email: string | null;
  bond_status: string | null;
  bond_tx_hash: string | null;
  bond_verified_at: string | null;
  bond_renewal_token_hash: string | null;
  approval_status: string | null;
};

type SellerAuthChallengeRow = {
  id: string;
  seller_id: string;
  passport_agent_id: string;
  proof_receiver_address: string;
  proof_token_address: string;
  proof_token_symbol: string;
  amount_atomic: string;
  amount_display: string;
  network_profile: NetworkProfileId;
  status: string;
  expires_at: string;
};

type ExistingValueFilterQuery = {
  eq(column: string, value: string): ExistingValueFilterQuery;
  is(column: string, value: null): ExistingValueFilterQuery;
};

type VerifiedSellerIdentity = {
  agentId: string;
  payerAddress: string;
  subject: string;
  email: string | null;
  authMethod: "passport_rs256" | "seller_bond";
  bond?: {
    challengeId: string;
    txHash: string;
    verifiedAt: string;
    receiverAddress: string;
    tokenAddress: string;
    tokenSymbol: string;
    amountAtomic: string;
    amountDisplay: string;
    renewalToken: string;
    renewalTokenHash: string;
    renewalTokenIssuedAt: string;
  };
  skipSellerUpdate?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string.`);
  }

  return value.trim();
}

function parseSellerSessionRequest(input: unknown): SellerSessionRequest {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  const challengeId =
    typeof input.challenge_id === "string" && input.challenge_id.trim() !== ""
      ? input.challenge_id.trim()
      : undefined;
  const txHash =
    typeof input.tx_hash === "string" && input.tx_hash.trim() !== ""
      ? input.tx_hash.trim()
      : undefined;
  const sellerRenewalToken =
    typeof input.seller_renewal_token === "string" &&
    input.seller_renewal_token.trim() !== ""
      ? input.seller_renewal_token.trim()
      : undefined;

  return {
    seller_id: readRequiredString(input, "seller_id"),
    passport_agent_id: readRequiredString(input, "passport_agent_id"),
    network_profile: parseNetworkProfileId(
      typeof input.network_profile === "string"
        ? input.network_profile.trim()
        : undefined,
      "live-mainnet"
    ),
    challenge_id: challengeId,
    tx_hash: txHash,
    seller_renewal_token: sellerRenewalToken
  };
}

function normalizeSellerAddress(value: string): string {
  if (!isAddress(value)) {
    throw new Error("seller_id must be a valid EVM address.");
  }

  return getAddress(value);
}

function requirePassportSellerIdentity(
  identity: Awaited<ReturnType<typeof verifyPassportBearerToken>>
): { agentId: string; payerAddress: string } {
  if (!identity.agentId || !identity.payerAddress) {
    throw new PassportAuthError(
      "Passport bearer token must include verified agent id and payer address claims.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  return {
    agentId: identity.agentId,
    payerAddress: identity.payerAddress
  };
}

function sellerBondSubject(sellerId: string): string {
  return `wallet-proof:${sellerId.toLowerCase()}`;
}

function applyExistingValueFilter<Query extends ExistingValueFilterQuery>(
  query: Query,
  column: string,
  value: string | null
): Query {
  if (value) {
    return query.eq(column, value) as Query;
  }

  return query.is(column, null) as Query;
}

function hasReusableSellerBond(params: {
  seller: SellerSessionRow;
  sellerId: string;
  passportAgentId: string;
  renewalToken?: string;
  secret: string;
}) {
  return (
    params.seller.bond_status === "verified" &&
    params.seller.bond_tx_hash &&
    params.seller.passport_agent_id === params.passportAgentId &&
    params.seller.passport_payer_addr?.toLowerCase() ===
      params.sellerId.toLowerCase() &&
    params.seller.passport_subject === sellerBondSubject(params.sellerId) &&
    verifySellerRenewalToken({
      token: params.renewalToken,
      expectedHash: params.seller.bond_renewal_token_hash,
      secret: params.secret
    })
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Request body must be valid JSON.", "INVALID_JSON");
  }

  let sessionRequest: SellerSessionRequest;

  try {
    sessionRequest = parseSellerSessionRequest(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid seller session body.",
      "INVALID_REQUEST"
    );
  }

  let normalizedSellerId: string;

  try {
    normalizedSellerId = normalizeSellerAddress(sessionRequest.seller_id);
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
    networkProfile = getNetworkProfile(env, sessionRequest.network_profile);
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for seller session.",
      "GATEWAY_CONFIG_MISSING",
      {
        code: error instanceof NetworkProfileConfigError ? error.code : undefined,
        reason: error instanceof Error ? error.message : "Unknown config error."
      }
    );
  }

  const supabase = createServerSupabaseClient();
  const passportToken = readBearerToken(request.headers.get("authorization"));
  const hasSellerBondProof = Boolean(
    sessionRequest.challenge_id && sessionRequest.tx_hash
  );
  let verifiedSeller: VerifiedSellerIdentity;

  const { data: seller, error: readError } = await supabase
    .from("sellers")
    .select(
      "id, passport_agent_id, passport_payer_addr, passport_subject, passport_email, bond_status, bond_tx_hash, bond_verified_at, bond_renewal_token_hash, approval_status"
    )
    .eq("id", sessionRequest.seller_id)
    .eq("network_profile", sessionRequest.network_profile)
    .maybeSingle();

  if (readError) {
    return internalServerErrorResponse(
      "Failed to load seller for session.",
      "SELLER_READ_FAILED",
      { reason: readError.message }
    );
  }

  if (!seller) {
    return notFoundResponse("Seller not found.", "SELLER_NOT_FOUND");
  }

  const sellerRow = seller as SellerSessionRow;

  if (sellerRow.approval_status && sellerRow.approval_status !== "approved") {
    return forbiddenResponse(
      "Seller is not approved for Gateway sessions.",
      "SELLER_NOT_APPROVED"
    );
  }

  if (hasSellerBondProof) {
    const { data: challenge, error: challengeReadError } = await supabase
      .from("seller_auth_challenges")
      .select(
        "id, seller_id, passport_agent_id, proof_receiver_address, proof_token_address, proof_token_symbol, amount_atomic, amount_display, network_profile, status, expires_at"
      )
      .eq("id", sessionRequest.challenge_id as string)
      .eq("network_profile", sessionRequest.network_profile)
      .maybeSingle();

    if (challengeReadError) {
      return internalServerErrorResponse(
        "Failed to load seller bond challenge.",
        "SELLER_BOND_CHALLENGE_READ_FAILED",
        { reason: challengeReadError.message }
      );
    }

    if (!challenge) {
      return notFoundResponse(
        "Seller bond challenge not found.",
        "SELLER_BOND_CHALLENGE_NOT_FOUND"
      );
    }

    const challengeRow = challenge as SellerAuthChallengeRow;

    if (challengeRow.status !== "pending") {
      return forbiddenResponse(
        "Seller bond challenge is not pending.",
        "SELLER_BOND_CHALLENGE_INVALID"
      );
    }

    if (new Date(challengeRow.expires_at).getTime() <= Date.now()) {
      return forbiddenResponse(
        "Seller bond challenge has expired.",
        "SELLER_BOND_CHALLENGE_EXPIRED"
      );
    }

    if (challengeRow.seller_id.toLowerCase() !== normalizedSellerId.toLowerCase()) {
      return forbiddenResponse(
        "Seller bond challenge does not match seller_id.",
        "SELLER_BOND_CHALLENGE_MISMATCH"
      );
    }

    if (challengeRow.network_profile !== sessionRequest.network_profile) {
      return forbiddenResponse(
        "Seller bond challenge does not match network_profile.",
        "SELLER_BOND_CHALLENGE_MISMATCH"
      );
    }

    if (challengeRow.passport_agent_id !== sessionRequest.passport_agent_id) {
      return forbiddenResponse(
        "Seller bond challenge does not match the requested seller agent.",
        "SELLER_BOND_CHALLENGE_MISMATCH"
      );
    }

    try {
      await verifySellerBondTransferReceipt({
        txHash: sessionRequest.tx_hash as string,
        sellerId: normalizedSellerId,
        receiverAddress: challengeRow.proof_receiver_address,
        tokenAddress: challengeRow.proof_token_address,
        amountAtomic: challengeRow.amount_atomic,
        rpcUrl: networkProfile.rpcUrl
      });
    } catch (error) {
      if (error instanceof SellerBondReceiptError) {
        return forbiddenResponse(error.message, error.code);
      }

      return internalServerErrorResponse(
        "Failed to verify seller bond transfer.",
        "SELLER_BOND_VERIFY_FAILED",
        { reason: error instanceof Error ? error.message : "Unknown bond error." }
      );
    }

    const verifiedAt = new Date().toISOString();
    const { data: verifiedChallenge, error: challengeUpdateError } = await supabase
      .from("seller_auth_challenges")
      .update({
        status: "verified",
        tx_hash: sessionRequest.tx_hash,
        verified_at: verifiedAt,
        updated_at: verifiedAt
      })
      .eq("id", challengeRow.id)
      .eq("network_profile", sessionRequest.network_profile)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (challengeUpdateError) {
      if ("code" in challengeUpdateError && challengeUpdateError.code === "23505") {
        return forbiddenResponse(
          "Seller bond transaction was already used.",
          "SELLER_BOND_TX_REUSED"
        );
      }

      return internalServerErrorResponse(
        "Failed to mark seller bond challenge verified.",
        "SELLER_BOND_CHALLENGE_UPDATE_FAILED",
        { reason: challengeUpdateError.message }
      );
    }

    if (!verifiedChallenge) {
      return forbiddenResponse(
        "Seller bond challenge changed before the session could be created.",
        "SELLER_BOND_CHALLENGE_STALE"
      );
    }

    const renewalToken = createSellerRenewalToken();

    verifiedSeller = {
      agentId: sessionRequest.passport_agent_id,
      payerAddress: normalizedSellerId,
      subject: sellerBondSubject(normalizedSellerId),
      email: null,
      authMethod: "seller_bond",
      bond: {
        challengeId: challengeRow.id,
        txHash: sessionRequest.tx_hash as string,
        verifiedAt,
        receiverAddress: challengeRow.proof_receiver_address,
        tokenAddress: challengeRow.proof_token_address,
        tokenSymbol: challengeRow.proof_token_symbol,
        amountAtomic: challengeRow.amount_atomic,
        amountDisplay: challengeRow.amount_display,
        renewalToken,
        renewalTokenHash: hashSellerRenewalToken(renewalToken, env.GATEWAY_SALT),
        renewalTokenIssuedAt: verifiedAt
      }
    };
  } else if (passportToken) {
    let identity: Awaited<ReturnType<typeof verifyPassportBearerToken>>;

    try {
      identity = await verifyPassportBearerToken(passportToken, {
        issuer: env.KITE_PASSPORT_ISSUER,
        jwksUrl: env.KITE_PASSPORT_JWKS_URL
      });
      requirePassportSellerIdentity(identity);
    } catch (error) {
      if (error instanceof PassportAuthError) {
        return forbiddenResponse(error.message, error.code);
      }

      return internalServerErrorResponse(
        "Failed to verify Passport bearer token.",
        "PASSPORT_VERIFY_FAILED",
        {
          reason:
            error instanceof Error ? error.message : "Unknown Passport error."
        }
      );
    }

    const passportSeller = requirePassportSellerIdentity(identity);

    if (
      passportSeller.payerAddress.toLowerCase() !== normalizedSellerId.toLowerCase()
    ) {
      return forbiddenResponse(
        "Passport payer address does not match seller_id.",
        "SELLER_PASSPORT_MISMATCH"
      );
    }

    if (passportSeller.agentId !== sessionRequest.passport_agent_id) {
      return forbiddenResponse(
        "Passport agent id does not match the requested seller agent.",
        "SELLER_PASSPORT_MISMATCH"
      );
    }

    verifiedSeller = {
      agentId: passportSeller.agentId,
      payerAddress: passportSeller.payerAddress,
      subject: identity.subject,
      email: identity.email,
      authMethod: "passport_rs256"
    };
  } else if (
    hasReusableSellerBond({
      seller: sellerRow,
      sellerId: normalizedSellerId,
      passportAgentId: sessionRequest.passport_agent_id,
      renewalToken: sessionRequest.seller_renewal_token,
      secret: env.GATEWAY_SALT
    })
  ) {
    verifiedSeller = {
      agentId: sessionRequest.passport_agent_id,
      payerAddress: normalizedSellerId,
      subject: sellerBondSubject(normalizedSellerId),
      email: sellerRow.passport_email,
      authMethod: "seller_bond",
      skipSellerUpdate: true
    };
  } else {
    return forbiddenResponse(
      "Passport bearer token, seller bond proof, or an existing verified seller bond is required to create a seller session.",
      "PASSPORT_AUTH_REQUIRED"
    );
  }

  if (
    sellerRow.passport_agent_id &&
    sellerRow.passport_agent_id !== verifiedSeller.agentId &&
    !verifiedSeller.bond
  ) {
    return forbiddenResponse(
      "Passport agent id does not match the registered seller.",
      "SELLER_PASSPORT_MISMATCH"
    );
  }

  if (
    sellerRow.passport_payer_addr &&
    sellerRow.passport_payer_addr.toLowerCase() !== verifiedSeller.payerAddress.toLowerCase()
  ) {
    return forbiddenResponse(
      "Passport payer address does not match seller_id.",
      "SELLER_PASSPORT_MISMATCH"
    );
  }

  if (
    sellerRow.passport_subject &&
    sellerRow.passport_subject !== verifiedSeller.subject &&
    !(
      verifiedSeller.bond &&
      sellerRow.passport_subject.startsWith("wallet-proof:")
    )
  ) {
    return forbiddenResponse(
      "Passport user does not own this seller registration.",
      "SELLER_PASSPORT_MISMATCH"
    );
  }

  if (!verifiedSeller.skipSellerUpdate) {
    const sellerUpdate: Record<string, string | null> = {
      passport_agent_id: verifiedSeller.agentId,
      passport_payer_addr: verifiedSeller.payerAddress,
      passport_subject: verifiedSeller.subject,
      passport_email: verifiedSeller.email,
      updated_at: new Date().toISOString()
    };

    if (verifiedSeller.bond) {
      sellerUpdate.bond_status = "verified";
      sellerUpdate.bond_tx_hash = verifiedSeller.bond.txHash;
      sellerUpdate.bond_verified_at = verifiedSeller.bond.verifiedAt;
      sellerUpdate.bond_challenge_id = verifiedSeller.bond.challengeId;
      sellerUpdate.bond_receiver_address = verifiedSeller.bond.receiverAddress;
      sellerUpdate.bond_token_address = verifiedSeller.bond.tokenAddress;
      sellerUpdate.bond_token_symbol = verifiedSeller.bond.tokenSymbol;
      sellerUpdate.bond_amount_atomic = verifiedSeller.bond.amountAtomic;
      sellerUpdate.bond_amount_display = verifiedSeller.bond.amountDisplay;
      sellerUpdate.bond_renewal_token_hash =
        verifiedSeller.bond.renewalTokenHash;
      sellerUpdate.bond_renewal_token_issued_at =
        verifiedSeller.bond.renewalTokenIssuedAt;
    }

    let bindQuery = supabase
      .from("sellers")
      .update(sellerUpdate)
      .eq("id", sessionRequest.seller_id);
    bindQuery = bindQuery.eq("network_profile", sessionRequest.network_profile);

    bindQuery = applyExistingValueFilter(
      bindQuery,
      "passport_agent_id",
      sellerRow.passport_agent_id
    );
    bindQuery = applyExistingValueFilter(
      bindQuery,
      "passport_payer_addr",
      sellerRow.passport_payer_addr
    );
    bindQuery = applyExistingValueFilter(
      bindQuery,
      "passport_subject",
      sellerRow.passport_subject
    );

    const { data: boundSeller, error: updateError } = await bindQuery
      .select("id")
      .maybeSingle();

    if (updateError) {
      return internalServerErrorResponse(
        "Failed to bind seller Passport identity.",
        "SELLER_SESSION_BIND_FAILED",
        { reason: updateError.message }
      );
    }

    if (!boundSeller) {
      return forbiddenResponse(
        "Seller Passport identity changed before the session could be created.",
        "SELLER_PASSPORT_MISMATCH"
      );
    }
  }

  const ttlSeconds = Number.parseInt(env.SELLER_SESSION_TTL_SECONDS, 10);
  const normalizedTtlSeconds =
    Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 900;
  const issuedAt = new Date();
  const sellerSessionToken = await createSellerSessionToken(
    {
      sellerId: sessionRequest.seller_id,
      passportAgentId: verifiedSeller.agentId,
      passportSubject: verifiedSeller.subject,
      networkProfile: sessionRequest.network_profile
    },
    env.GATEWAY_SALT,
    {
      now: issuedAt,
      ttlSeconds: normalizedTtlSeconds
    }
  );

  return NextResponse.json({
    status: "ok",
    seller_id: sessionRequest.seller_id,
    network_profile: sessionRequest.network_profile,
    auth_method: verifiedSeller.authMethod,
    token_type: "Bearer",
    seller_session_token: sellerSessionToken,
    seller_renewal_token: verifiedSeller.bond?.renewalToken,
    expires_in_seconds: normalizedTtlSeconds,
    expires_at: new Date(
      issuedAt.getTime() + normalizedTtlSeconds * 1000
    ).toISOString()
  });
}
