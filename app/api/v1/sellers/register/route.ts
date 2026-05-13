import { NextResponse } from "next/server";
import {
  badRequestResponse,
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
    status: "offline",
    last_heartbeat_at: null,
    updated_at: updatedAt
  };

  const writeResult = existingSellerRow?.passport_subject
    ? await supabase
        .from("sellers")
        .update(sellerProfile)
        .eq("id", seller.seller_id)
    : await supabase.from("sellers").upsert(
        {
          id: seller.seller_id,
          ...sellerProfile,
          passport_agent_id: null,
          passport_payer_addr: seller.seller_id,
          approval_status: "approved"
        },
        {
          onConflict: "id"
        }
      );

  if (writeResult.error) {
    return internalServerErrorResponse(
      "Failed to register seller.",
      "SELLER_REGISTER_FAILED",
      { reason: writeResult.error.message }
    );
  }

  const { error: eventError } = await supabase.from("events").insert({
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
    seller_id: seller.seller_id
  });
}
