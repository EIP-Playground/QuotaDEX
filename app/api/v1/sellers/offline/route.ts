import { NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  internalServerErrorResponse,
  notFoundResponse
} from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import {
  assertValidSellerSession,
  SellerSessionError
} from "@/lib/seller-session";
import { parseSellerIdentityBody } from "@/lib/sellers";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Request body must be valid JSON.", "INVALID_JSON");
  }

  let seller: ReturnType<typeof parseSellerIdentityBody>;

  try {
    seller = parseSellerIdentityBody(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid seller offline body.",
      "INVALID_REQUEST"
    );
  }

  let env: ReturnType<typeof getServerEnv>;

  try {
    env = getServerEnv();
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for seller offline update.",
      "GATEWAY_CONFIG_MISSING",
      { reason: error instanceof Error ? error.message : "Unknown config error." }
    );
  }

  try {
    await assertValidSellerSession({
      sellerId: seller.seller_id,
      authorizationHeader: request.headers.get("authorization"),
      secret: env.GATEWAY_SALT
    });
  } catch (error) {
    if (error instanceof SellerSessionError) {
      return forbiddenResponse(error.message, error.code);
    }

    return internalServerErrorResponse(
      "Failed to verify seller offline session.",
      "SELLER_SESSION_CHECK_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown session error." }
    );
  }

  const supabase = createServerSupabaseClient();
  const { data: updatedSeller, error: updateError } = await supabase
    .from("sellers")
    .update({
      status: "offline",
      updated_at: new Date().toISOString()
    })
    .eq("id", seller.seller_id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return internalServerErrorResponse(
      "Failed to set seller offline.",
      "SELLER_OFFLINE_FAILED",
      { reason: updateError.message }
    );
  }

  if (!updatedSeller) {
    return notFoundResponse("Seller not found.", "SELLER_NOT_FOUND");
  }

  const { error: eventError } = await supabase.from("events").insert({
    type: "SELLER_OFFLINE",
    message: `Seller ${seller.seller_id} is offline.`
  });

  if (eventError) {
    console.error("Failed to log seller offline event", {
      sellerId: seller.seller_id,
      reason: eventError.message
    });
  }

  return NextResponse.json({
    status: "offline",
    seller_id: seller.seller_id
  });
}
