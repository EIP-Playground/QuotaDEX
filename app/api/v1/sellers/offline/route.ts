import { NextResponse } from "next/server";
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse
} from "@/lib/errors";
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
