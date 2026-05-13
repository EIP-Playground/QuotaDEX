import { createHmac, timingSafeEqual } from "node:crypto";

export type SellerSessionClaims = {
  sellerId: string;
  passportAgentId: string;
  passportSubject: string;
  issuedAt: number;
  expiresAt: number;
};

export class SellerSessionError extends Error {
  readonly code = "SELLER_SESSION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "SellerSessionError";
  }
}

const SELLER_SESSION_TYPE = "quotadex-seller-session";
const DEFAULT_TTL_SECONDS = 15 * 60;

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(input: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(input).digest());
}

export function readBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function createSellerSessionToken(
  input: {
    sellerId: string;
    passportAgentId: string;
    passportSubject: string;
  },
  secret: string,
  options: {
    now?: Date;
    ttlSeconds?: number;
  } = {}
): Promise<string> {
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const header = {
    alg: "HS256",
    typ: SELLER_SESSION_TYPE
  };
  const payload = {
    typ: SELLER_SESSION_TYPE,
    seller_id: input.sellerId,
    passport_agent_id: input.passportAgentId,
    passport_subject: input.passportSubject,
    iat: now,
    exp: now + ttlSeconds
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  return `${signingInput}.${sign(signingInput, secret)}`;
}

export async function verifySellerSessionToken(
  token: string,
  secret: string,
  now = new Date()
): Promise<SellerSessionClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new SellerSessionError("Seller session token is malformed.");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = sign(signingInput, secret);
  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new SellerSessionError("Seller session token signature is invalid.");
  }

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;

  try {
    header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch {
    throw new SellerSessionError("Seller session token payload is invalid.");
  }

  if (header.typ !== SELLER_SESSION_TYPE || payload.typ !== SELLER_SESSION_TYPE) {
    throw new SellerSessionError("Seller session token type is invalid.");
  }

  if (
    typeof payload.seller_id !== "string" ||
    typeof payload.passport_agent_id !== "string" ||
    typeof payload.passport_subject !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new SellerSessionError("Seller session token claims are incomplete.");
  }

  if (payload.exp <= Math.floor(now.getTime() / 1000)) {
    throw new SellerSessionError("Seller session token has expired.");
  }

  return {
    sellerId: payload.seller_id,
    passportAgentId: payload.passport_agent_id,
    passportSubject: payload.passport_subject,
    issuedAt: payload.iat,
    expiresAt: payload.exp
  };
}

export async function assertValidSellerSession(params: {
  sellerId: string;
  authorizationHeader: string | null;
  secret: string;
}): Promise<SellerSessionClaims> {
  const token = readBearerToken(params.authorizationHeader);

  if (!token) {
    throw new SellerSessionError("Gateway seller session bearer token is required.");
  }

  const claims = await verifySellerSessionToken(token, params.secret);

  if (claims.sellerId.toLowerCase() !== params.sellerId.toLowerCase()) {
    throw new SellerSessionError("Seller session token does not match seller_id.");
  }

  return claims;
}
