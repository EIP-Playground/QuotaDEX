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
      error instanceof Error ? error.message : "Invalid seller heartbeat body.",
      "INVALID_REQUEST"
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
