import { NextResponse } from "next/server";
import {
  badRequestResponse,
  internalServerErrorResponse
} from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import {
  getNetworkProfile,
  isNetworkProfileId,
  NetworkProfileConfigError,
  type NetworkProfileId
} from "@/lib/network-profiles";
import { listQuoteEligibleCapabilities } from "@/lib/jobs";

function parseBuyerCapabilitiesProfile(request: Request): NetworkProfileId {
  const url = new URL(request.url);
  const value = url.searchParams.get("network_profile") ?? "live-mainnet";

  if (!isNetworkProfileId(value)) {
    throw new Error("network_profile must be live-mainnet or live-testnet.");
  }

  return value;
}

export async function GET(request: Request) {
  let networkProfileId: NetworkProfileId;

  try {
    networkProfileId = parseBuyerCapabilitiesProfile(request);
  } catch (error) {
    return badRequestResponse(
      error instanceof Error ? error.message : "Invalid network_profile.",
      "INVALID_NETWORK_PROFILE"
    );
  }

  if (networkProfileId === "demo-testnet") {
    return badRequestResponse(
      "Buyer capability discovery is only available for live network profiles.",
      "BUYER_CAPABILITIES_PROFILE_UNSUPPORTED",
      {
        supported_profiles: ["live-mainnet", "live-testnet"]
      }
    );
  }

  try {
    const env = getServerEnv();
    const networkProfile = getNetworkProfile(env, networkProfileId);
    const capabilities = await listQuoteEligibleCapabilities(networkProfile.id);

    return NextResponse.json({
      network_profile: networkProfile.id,
      network: networkProfile.network,
      currency: networkProfile.paymentCurrency,
      updated_at: new Date().toISOString(),
      capabilities: capabilities.map((capability) => ({
        ...capability,
        currency: networkProfile.paymentCurrency
      }))
    });
  } catch (error) {
    return internalServerErrorResponse(
      "Failed to load buyer capability inventory.",
      "BUYER_CAPABILITIES_FAILED",
      {
        code: error instanceof NetworkProfileConfigError ? error.code : undefined,
        reason: error instanceof Error ? error.message : "Unknown capability error."
      }
    );
  }
}
