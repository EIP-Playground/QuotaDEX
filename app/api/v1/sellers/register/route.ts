import { NextResponse } from "next/server";
import {
  badRequestResponse,
  internalServerErrorResponse
} from "@/lib/errors";
import { parseRegisterSellerBody } from "@/lib/sellers";
import { createServerSupabaseClient } from "@/lib/supabase";

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

  const { error: upsertError } = await supabase.from("sellers").upsert(
    {
      id: seller.seller_id,
      wallet_address: seller.wallet ?? seller.seller_id,
      passport_agent_id: seller.passport_agent_id ?? null,
      passport_payer_addr: seller.passport_payer_addr ?? seller.seller_id,
      approval_status: "approved",
      capability: seller.capability,
      price_per_task: seller.price_per_task,
      status: "offline",
      last_heartbeat_at: null,
      updated_at: updatedAt
    },
    {
      onConflict: "id"
    }
  );

  if (upsertError) {
    return internalServerErrorResponse(
      "Failed to register seller.",
      "SELLER_REGISTER_FAILED",
      { reason: upsertError.message }
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
