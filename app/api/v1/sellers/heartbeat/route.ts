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
      error instanceof Error ? error.message : "Invalid seller heartbeat body.",
      "INVALID_REQUEST"
    );
  }

  let env: ReturnType<typeof getServerEnv>;

  try {
    env = getServerEnv();
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for seller heartbeat.",
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
      "Failed to verify seller heartbeat session.",
      "SELLER_SESSION_CHECK_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown session error." }
    );
  }

  const supabase = createServerSupabaseClient();
  const { data: existingSeller, error: readError } = await supabase
    .from("sellers")
    .select("id, status")
    .eq("id", seller.seller_id)
    .maybeSingle();

  if (readError) {
    return internalServerErrorResponse(
      "Failed to load seller state.",
      "SELLER_READ_FAILED",
      { reason: readError.message }
    );
  }

  if (!existingSeller) {
    return notFoundResponse("Seller not found.", "SELLER_NOT_FOUND");
  }

  const nextStatus =
    existingSeller.status === "busy" || existingSeller.status === "reserved"
      ? existingSeller.status
      : "idle";

  const { error: updateError } = await supabase
    .from("sellers")
    .update({
      status: nextStatus,
      passport_agent_id: seller.passport_agent_id ?? undefined,
      passport_payer_addr: seller.passport_payer_addr ?? seller.seller_id,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", seller.seller_id);

  if (updateError) {
    return internalServerErrorResponse(
      "Failed to update seller heartbeat.",
      "SELLER_HEARTBEAT_FAILED",
      { reason: updateError.message }
    );
  }

  return NextResponse.json({
    status: "ok",
    seller_id: seller.seller_id,
    seller_status: nextStatus
  });
}
