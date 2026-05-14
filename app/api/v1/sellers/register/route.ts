import { NextResponse } from "next/server";
import {
  badRequestResponse,
  conflictResponse,
  forbiddenResponse,
  internalServerErrorResponse
} from "@/lib/errors";
import {
  assertValidSellerSession,
  SellerSessionError
} from "@/lib/seller-session";
import { parseRegisterSellerBody } from "@/lib/sellers";
import { createServerSupabaseClient } from "@/lib/supabase";

type ExistingSellerRow = {
  id: string;
  passport_subject: string | null;
};

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Request body must be valid JSON.", "INVALID_JSON");
  }

  let seller: ReturnType<typeof parseRegisterSellerBody>;

  try {
    seller = parseRegisterSellerBody(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid seller registration body.",
      "INVALID_REQUEST"
    );
  }

  const supabase = createServerSupabaseClient();
  const updatedAt = new Date().toISOString();
  const { data: existingSeller, error: readError } = await supabase
    .from("sellers")
    .select("id, passport_subject")
    .eq("id", seller.seller_id)
    .eq("network_profile", seller.network_profile)
    .maybeSingle();

  if (readError) {
    return internalServerErrorResponse(
      "Failed to load existing seller.",
      "SELLER_READ_FAILED",
      { reason: readError.message }
    );
  }

  const existingSellerRow = existingSeller as ExistingSellerRow | null;

  if (existingSellerRow?.passport_subject) {
    const gatewaySecret = process.env.GATEWAY_SALT;

    if (!gatewaySecret) {
      return internalServerErrorResponse(
        "Missing Gateway configuration for protected seller registration.",
        "GATEWAY_CONFIG_MISSING",
        { reason: "Missing required environment variable: GATEWAY_SALT" }
      );
    }

    try {
      await assertValidSellerSession({
        sellerId: seller.seller_id,
        expectedNetworkProfile: seller.network_profile,
        authorizationHeader: request.headers.get("authorization"),
        secret: gatewaySecret
      });
    } catch (error) {
      if (error instanceof SellerSessionError) {
        return forbiddenResponse(error.message, error.code);
      }

      return internalServerErrorResponse(
        "Failed to verify seller registration session.",
        "SELLER_SESSION_CHECK_FAILED",
        { reason: error instanceof Error ? error.message : "Unknown session error." }
      );
    }
  }

  const sellerProfile = {
    wallet_address: seller.wallet ?? seller.seller_id,
    capability: seller.capability,
    price_per_task: seller.price_per_task,
    network_profile: seller.network_profile,
    status: "offline",
    last_heartbeat_at: null,
    updated_at: updatedAt
  };

  let writeError: { code?: string; message: string } | null = null;
  let staleUnboundRegistration = false;

  if (existingSellerRow?.passport_subject) {
    const { error } = await supabase
      .from("sellers")
      .update(sellerProfile)
      .eq("id", seller.seller_id)
      .eq("network_profile", seller.network_profile);

    writeError = error;
  } else if (existingSellerRow) {
    const { data, error } = await supabase
      .from("sellers")
      .update({
        ...sellerProfile,
        passport_payer_addr: seller.seller_id,
        approval_status: "approved"
      })
      .eq("id", seller.seller_id)
      .eq("network_profile", seller.network_profile)
      .is("passport_subject", null)
      .select("id")
      .maybeSingle();

    writeError = error;
    staleUnboundRegistration = !error && !data;
  } else {
    const { error } = await supabase.from("sellers").insert({
      id: seller.seller_id,
      ...sellerProfile,
      passport_agent_id: null,
      passport_payer_addr: seller.seller_id,
      approval_status: "approved"
    });

    writeError = error;
  }

  if (staleUnboundRegistration) {
    return conflictResponse(
      "Seller Passport identity changed before registration could be updated.",
      "SELLER_REGISTRATION_STALE"
    );
  }

  if (writeError) {
    if ("code" in writeError && writeError.code === "23505") {
      return conflictResponse(
        "Seller registration changed concurrently. Retry registration.",
        "SELLER_REGISTRATION_STALE"
      );
    }

    return internalServerErrorResponse(
      "Failed to register seller.",
      "SELLER_REGISTER_FAILED",
      { reason: writeError.message }
    );
  }

  const { error: eventError } = await supabase.from("events").insert({
    network_profile: seller.network_profile,
    type: "SELLER_REGISTERED",
    message: `Seller ${seller.seller_id} registered capability ${seller.capability}.`
  });

  if (eventError) {
    console.error("Failed to log seller register event", {
      sellerId: seller.seller_id,
      reason: eventError.message
    });
  }

  return NextResponse.json({
    status: "registered",
    seller_id: seller.seller_id,
    network_profile: seller.network_profile
  });
}
