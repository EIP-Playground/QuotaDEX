import {
  parseNetworkProfileId,
  type NetworkProfileId
} from "@/lib/network-profiles";

type RegisterSellerBody = {
  seller_id: string;
  capability: string;
  price_per_task: string;
  wallet?: string;
  passport_agent_id?: string;
  passport_payer_addr?: string;
  network_profile: NetworkProfileId;
};

type SellerIdentityBody = {
  seller_id: string;
  passport_agent_id?: string;
  passport_payer_addr?: string;
  network_profile: NetworkProfileId;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRequiredString(
  input: Record<string, unknown>,
  key: string
): string {
  const value = input[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string.`);
  }

  return value.trim();
}

export function parseRegisterSellerBody(input: unknown): RegisterSellerBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  const sellerId = readRequiredString(input, "seller_id");
  const capability = readRequiredString(input, "capability");
  const rawPrice = input.price_per_task;
  const wallet =
    typeof input.wallet === "string" && input.wallet.trim() !== ""
      ? input.wallet.trim()
      : undefined;
  const passportAgentId =
    typeof input.passport_agent_id === "string" &&
    input.passport_agent_id.trim() !== ""
      ? input.passport_agent_id.trim()
      : undefined;
  const passportPayerAddr =
    typeof input.passport_payer_addr === "string" &&
    input.passport_payer_addr.trim() !== ""
      ? input.passport_payer_addr.trim()
      : undefined;

  const normalizedPrice =
    typeof rawPrice === "number"
      ? rawPrice.toString()
      : typeof rawPrice === "string"
        ? rawPrice.trim()
        : "";

  const numericPrice = Number(normalizedPrice);

  if (normalizedPrice === "" || Number.isNaN(numericPrice) || numericPrice <= 0) {
    throw new Error("price_per_task must be a positive number.");
  }

  if (wallet && wallet !== sellerId) {
    throw new Error("wallet must match seller_id.");
  }

  if (passportPayerAddr && passportPayerAddr !== sellerId) {
    throw new Error("passport_payer_addr must match seller_id.");
  }

  return {
    seller_id: sellerId,
    capability,
    price_per_task: normalizedPrice,
    wallet,
    passport_agent_id: passportAgentId,
    passport_payer_addr: passportPayerAddr,
    network_profile: parseNetworkProfileId(
      typeof input.network_profile === "string"
        ? input.network_profile.trim()
        : undefined,
      "live-mainnet"
    )
  };
}

export function parseSellerIdentityBody(input: unknown): SellerIdentityBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  const sellerId = readRequiredString(input, "seller_id");
  const passportAgentId =
    typeof input.passport_agent_id === "string" &&
    input.passport_agent_id.trim() !== ""
      ? input.passport_agent_id.trim()
      : undefined;
  const passportPayerAddr =
    typeof input.passport_payer_addr === "string" &&
    input.passport_payer_addr.trim() !== ""
      ? input.passport_payer_addr.trim()
      : undefined;

  if (passportPayerAddr && passportPayerAddr !== sellerId) {
    throw new Error("passport_payer_addr must match seller_id.");
  }

  return {
    seller_id: sellerId,
    passport_agent_id: passportAgentId,
    passport_payer_addr: passportPayerAddr,
    network_profile: parseNetworkProfileId(
      typeof input.network_profile === "string"
        ? input.network_profile.trim()
        : undefined,
      "live-mainnet"
    )
  };
}
