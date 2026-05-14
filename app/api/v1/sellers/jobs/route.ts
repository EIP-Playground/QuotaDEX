import { NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  internalServerErrorResponse
} from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import {
  assertValidSellerCallbackAuth,
  SellerCallbackSignatureError
} from "@/lib/seller-callback-auth";
import {
  getNetworkProfile,
  NetworkProfileConfigError,
  parseNetworkProfileId,
  type NetworkProfileId
} from "@/lib/network-profiles";
import { createServerSupabaseClient } from "@/lib/supabase";

type SellerJobsRequest = {
  seller_id: string;
  network_profile: NetworkProfileId;
  seller_signature?: string;
  seller_signed_at?: string;
};

type SellerJobRow = {
  id: string;
  payment_id: string;
  status: "paid" | "running";
  payload: Record<string, unknown>;
  amount: string | number | null;
  currency: string | null;
  payment_mode: string | null;
  created_at: string | null;
  expires_at: string | null;
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

function readOptionalString(
  input: Record<string, unknown>,
  key: string
): string | undefined {
  const value = input[key];

  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function parseSellerJobsRequest(input: unknown): SellerJobsRequest {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  return {
    seller_id: readRequiredString(input, "seller_id"),
    network_profile: parseNetworkProfileId(
      typeof input.network_profile === "string"
        ? input.network_profile.trim()
        : undefined,
      "live-mainnet"
    ),
    seller_signature: readOptionalString(input, "seller_signature"),
    seller_signed_at: readOptionalString(input, "seller_signed_at")
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Request body must be valid JSON.", "INVALID_JSON");
  }

  let jobsRequest: SellerJobsRequest;

  try {
    jobsRequest = parseSellerJobsRequest(body);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid seller jobs body.",
      "INVALID_REQUEST"
    );
  }

  let env: ReturnType<typeof getServerEnv>;
  let networkProfile: ReturnType<typeof getNetworkProfile>;

  try {
    env = getServerEnv();
    networkProfile = getNetworkProfile(env, jobsRequest.network_profile);
  } catch (error) {
    return internalServerErrorResponse(
      "Missing Gateway configuration for seller job polling.",
      "GATEWAY_CONFIG_MISSING",
      {
        code: error instanceof NetworkProfileConfigError ? error.code : undefined,
        reason: error instanceof Error ? error.message : "Unknown config error."
      }
    );
  }

  try {
    await assertValidSellerCallbackAuth({
      action: "poll",
      jobId: "seller-jobs",
      sellerId: jobsRequest.seller_id,
      signature: jobsRequest.seller_signature,
      signedAt: jobsRequest.seller_signed_at,
      rpcUrl: networkProfile.rpcUrl,
      authorizationHeader: request.headers.get("authorization"),
      gatewaySecret: env.GATEWAY_SALT,
      expectedNetworkProfile: jobsRequest.network_profile,
      allowLegacySignatureAuth: env.ALLOW_SELLER_SIGNATURE_AUTH === "true"
    });
  } catch (error) {
    if (error instanceof SellerCallbackSignatureError) {
      return forbiddenResponse(error.message, error.code);
    }

    return internalServerErrorResponse(
      "Failed to verify seller polling signature.",
      "SELLER_SIGNATURE_CHECK_FAILED",
      { reason: error instanceof Error ? error.message : "Unknown signature error." }
    );
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, payment_id, status, payload, amount, currency, payment_mode, created_at, expires_at"
    )
    .eq("seller_id", jobsRequest.seller_id)
    .eq("network_profile", jobsRequest.network_profile)
    .in("status", ["paid", "running"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    return internalServerErrorResponse(
      "Failed to load seller jobs.",
      "SELLER_JOBS_READ_FAILED",
      { reason: error.message }
    );
  }

  const jobs = ((data ?? []) as SellerJobRow[]).map((job) => ({
    job_id: job.id,
    payment_id: job.payment_id,
    status: job.status,
    payload: job.payload,
    amount: job.amount === null ? null : String(job.amount),
    currency: job.currency,
    payment_mode: job.payment_mode,
    created_at: job.created_at,
    expires_at: job.expires_at
  }));

  return NextResponse.json({
    seller_id: jobsRequest.seller_id,
    network_profile: jobsRequest.network_profile,
    jobs
  });
}
