const DEFAULT_PIEVERSE_FACILITATOR_BASE_URL = "https://facilitator.pieverse.io";
export const DEFAULT_FACILITATOR_NETWORK = "kite-testnet";
export const DEFAULT_FACILITATOR_SCHEME = "gokite-aa";

export type X402AcceptEntry = {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema: unknown;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: unknown;
  merchantName: string;
};

export type X402PaymentRequiredResponse = {
  error: string;
  accepts: X402AcceptEntry[];
  x402Version: number;
};

export type FacilitatorPaymentPayload = {
  authorization: Record<string, unknown>;
  signature: string;
  network?: string;
  [key: string]: unknown;
};

export type FacilitatorVerifyResponse = {
  valid?: boolean;
  error?: string;
  [key: string]: unknown;
};

export type FacilitatorSettleResponse = {
  success?: boolean;
  txHash?: string;
  error?: string;
  [key: string]: unknown;
};

export class FacilitatorRequestError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_X_PAYMENT_HEADER"
      | "FACILITATOR_HTTP_ERROR"
      | "FACILITATOR_RESPONSE_INVALID",
    readonly status?: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "FacilitatorRequestError";
  }
}

export function normalizeFacilitatorBaseUrl(baseUrl?: string): string {
  const value = (baseUrl ?? DEFAULT_PIEVERSE_FACILITATOR_BASE_URL).trim();
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function decodeXPaymentHeader(
  xPaymentHeader: string
): FacilitatorPaymentPayload {
  try {
    const decoded = Buffer.from(xPaymentHeader.trim(), "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("X-PAYMENT payload must decode into an object.");
    }

    if (
      !("authorization" in parsed) ||
      typeof parsed.authorization !== "object" ||
      parsed.authorization === null ||
      Array.isArray(parsed.authorization) ||
      !("signature" in parsed) ||
      typeof parsed.signature !== "string"
    ) {
      throw new Error(
        "X-PAYMENT payload must contain authorization and signature."
      );
    }

    return parsed as FacilitatorPaymentPayload;
  } catch (error) {
    throw new FacilitatorRequestError(
      error instanceof Error
        ? error.message
        : "Failed to decode X-PAYMENT header.",
      "INVALID_X_PAYMENT_HEADER"
    );
  }
}

async function facilitatorPostJson<TResponse>(
  path: "/v2/verify" | "/v2/settle",
  paymentPayload: FacilitatorPaymentPayload,
  baseUrl?: string
): Promise<TResponse> {
  const response = await fetch(`${normalizeFacilitatorBaseUrl(baseUrl)}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(paymentPayload)
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw new FacilitatorRequestError(
      `Facilitator request failed for ${path}.`,
      "FACILITATOR_HTTP_ERROR",
      response.status,
      payload
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new FacilitatorRequestError(
      `Facilitator returned an invalid ${path} response body.`,
      "FACILITATOR_RESPONSE_INVALID",
      response.status,
      payload
    );
  }

  return payload as TResponse;
}

export async function verifyFacilitatorPayment(params: {
  paymentPayload: FacilitatorPaymentPayload;
  baseUrl?: string;
}): Promise<FacilitatorVerifyResponse> {
  return facilitatorPostJson<FacilitatorVerifyResponse>(
    "/v2/verify",
    params.paymentPayload,
    params.baseUrl
  );
}

export async function settleFacilitatorPayment(params: {
  paymentPayload: FacilitatorPaymentPayload;
  baseUrl?: string;
}): Promise<FacilitatorSettleResponse> {
  return facilitatorPostJson<FacilitatorSettleResponse>(
    "/v2/settle",
    params.paymentPayload,
    params.baseUrl
  );
}

export function buildX402AcceptEntry(params: {
  asset: string;
  payTo: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  merchantName: string;
  outputSchema: unknown;
  mimeType?: string;
  network?: string;
  scheme?: string;
  maxTimeoutSeconds?: number;
  extra?: unknown;
}): X402AcceptEntry {
  return {
    scheme: params.scheme ?? DEFAULT_FACILITATOR_SCHEME,
    network: params.network ?? DEFAULT_FACILITATOR_NETWORK,
    maxAmountRequired: params.maxAmountRequired,
    resource: params.resource,
    description: params.description,
    mimeType: params.mimeType ?? "application/json",
    outputSchema: params.outputSchema,
    payTo: params.payTo,
    maxTimeoutSeconds: params.maxTimeoutSeconds ?? 300,
    asset: params.asset,
    extra: params.extra ?? null,
    merchantName: params.merchantName
  };
}

export function buildX402PaymentRequiredResponse(params: {
  accepts: X402AcceptEntry[];
  error?: string;
  x402Version?: number;
}): X402PaymentRequiredResponse {
  return {
    error: params.error ?? "X-PAYMENT header is required",
    accepts: params.accepts,
    x402Version: params.x402Version ?? 1
  };
}
