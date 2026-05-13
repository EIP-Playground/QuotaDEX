import { NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse
} from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import {
  PassportAuthError,
  verifyPassportBearerToken
} from "@/lib/passport-auth";
import { createSellerSessionToken, readBearerToken } from "@/lib/seller-session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAddress, isAddress } from "viem";

type SellerSessionRequest = {
  seller_id: string;
  passport_agent_id: string;
};

type SellerSessionRow = {
  id: string;
  passport_agent_id: string | null;
  passport_payer_addr: string | null;
  passport_subject: string | null;
  approval_status: string | null;
};

type ExistingValueFilterQuery = {
  eq(column: string, value: string): ExistingValueFilterQuery;
  is(column: string, value: null): ExistingValueFilterQuery;
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

  return {
    seller_id: readRequiredString(input, "seller_id"),
    passport_agent_id: readRequiredString(input, "passport_agent_id")
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

  try {
    env = getServerEnv();
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for seller session.",
      "GATEWAY_CONFIG_MISSING",
      { reason: error instanceof Error ? error.message : "Unknown config error." }
    );
  }

  const passportToken = readBearerToken(request.headers.get("authorization"));

  if (!passportToken) {
    return forbiddenResponse(
      "Passport bearer token is required to create a seller session.",
      "PASSPORT_AUTH_REQUIRED"
    );
  }

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
      { reason: error instanceof Error ? error.message : "Unknown Passport error." }
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

  const supabase = createServerSupabaseClient();
  const { data: seller, error: readError } = await supabase
    .from("sellers")
    .select(
      "id, passport_agent_id, passport_payer_addr, passport_subject, approval_status"
    )
    .eq("id", sessionRequest.seller_id)
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

  if (
    sellerRow.passport_agent_id &&
    sellerRow.passport_agent_id !== passportSeller.agentId
  ) {
    return forbiddenResponse(
      "Passport agent id does not match the registered seller.",
      "SELLER_PASSPORT_MISMATCH"
    );
  }

  if (
    sellerRow.passport_payer_addr &&
    sellerRow.passport_payer_addr.toLowerCase() !== passportSeller.payerAddress.toLowerCase()
  ) {
    return forbiddenResponse(
      "Passport payer address does not match seller_id.",
      "SELLER_PASSPORT_MISMATCH"
    );
  }

  if (
    sellerRow.passport_subject &&
    sellerRow.passport_subject !== identity.subject
  ) {
    return forbiddenResponse(
      "Passport user does not own this seller registration.",
      "SELLER_PASSPORT_MISMATCH"
    );
  }

  let bindQuery = supabase
    .from("sellers")
    .update({
      passport_agent_id: passportSeller.agentId,
      passport_payer_addr: passportSeller.payerAddress,
      passport_subject: identity.subject,
      passport_email: identity.email,
      updated_at: new Date().toISOString()
    })
    .eq("id", sessionRequest.seller_id);

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

  const ttlSeconds = Number.parseInt(env.SELLER_SESSION_TTL_SECONDS, 10);
  const normalizedTtlSeconds =
    Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 900;
  const issuedAt = new Date();
  const sellerSessionToken = await createSellerSessionToken(
    {
      sellerId: sessionRequest.seller_id,
      passportAgentId: passportSeller.agentId,
      passportSubject: identity.subject
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
    token_type: "Bearer",
    seller_session_token: sellerSessionToken,
    expires_in_seconds: normalizedTtlSeconds,
    expires_at: new Date(
      issuedAt.getTime() + normalizedTtlSeconds * 1000
    ).toISOString()
  });
}
