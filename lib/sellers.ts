type RegisterSellerBody = {
  seller_id: string;
  capability: string;
  price_per_task: string;
  wallet?: string;
};

type SellerIdentityBody = {
  seller_id: string;
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

  const normalizedPrice =
    typeof rawPrice === "number"
      ? rawPrice.toString()
      : typeof rawPrice === "string"
        ? rawPrice.trim()
        : "";

  const numericPrice = Number(normalizedPrice);

  if (normalizedPrice === "" || Number.isNaN(numericPrice) || numericPrice < 0) {
    throw new Error("price_per_task must be a non-negative number.");
  }

  if (wallet && wallet !== sellerId) {
    throw new Error("wallet must match seller_id in the MVP seller model.");
  }

  return {
    seller_id: sellerId,
    capability,
    price_per_task: normalizedPrice,
    wallet
  };
}

export function parseSellerIdentityBody(input: unknown): SellerIdentityBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  return {
    seller_id: readRequiredString(input, "seller_id")
  };
}
