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
    sellerRow.passport_agent_id !== sessionRequest.passport_agent_id
  ) {
    return forbiddenResponse(
      "Passport agent id does not match the registered seller.",
      "SELLER_PASSPORT_MISMATCH"
    );
  }

  if (
    sellerRow.passport_payer_addr &&
    sellerRow.passport_payer_addr.toLowerCase() !== sessionRequest.seller_id.toLowerCase()
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

  const { error: updateError } = await supabase
    .from("sellers")
    .update({
      passport_agent_id: sessionRequest.passport_agent_id,
      passport_subject: identity.subject,
      passport_email: identity.email,
      updated_at: new Date().toISOString()
    })
    .eq("id", sessionRequest.seller_id);

  if (updateError) {
    return internalServerErrorResponse(
      "Failed to bind seller Passport identity.",
      "SELLER_SESSION_BIND_FAILED",
      { reason: updateError.message }
    );
  }

  const ttlSeconds = Number.parseInt(env.SELLER_SESSION_TTL_SECONDS, 10);
  const normalizedTtlSeconds =
    Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 900;
  const issuedAt = new Date();
  const sellerSessionToken = await createSellerSessionToken(
    {
      sellerId: sessionRequest.seller_id,
      passportAgentId: sessionRequest.passport_agent_id,
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
