import {
  createPublicKey,
  verify,
  type JsonWebKey as NodeJsonWebKey
} from "node:crypto";
import { getAddress, isAddress } from "viem";

type JsonWebKeySet = {
  keys?: NodeJsonWebKey[];
};

type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type JwtPayload = {
  iss?: string;
  sub?: string;
  email?: string;
  exp?: number;
  nbf?: number;
  [key: string]: unknown;
};

export type PassportIdentity = {
  subject: string;
  email: string | null;
  issuer: string;
  agentId: string | null;
  payerAddress: string | null;
};

export class PassportAuthError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PASSPORT_AUTH_REQUIRED"
      | "PASSPORT_TOKEN_INVALID"
      | "PASSPORT_TOKEN_EXPIRED"
  ) {
    super(message);
    this.name = "PassportAuthError";
  }
}

let jwksCache:
  | {
      url: string;
      keys: NodeJsonWebKey[];
      fetchedAt: number;
    }
  | null = null;

const JWKS_CACHE_MS = 5 * 60 * 1000;

function base64UrlDecodeJson<T>(value: string): T {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return JSON.parse(
    Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
  ) as T;
}

function readNestedRecord(
  input: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = input[key];

  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readStringClaim(
  payload: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return null;
}

function readNestedStringClaim(
  payload: Record<string, unknown>,
  parentKeys: string[],
  childKeys: string[]
): string | null {
  for (const parentKey of parentKeys) {
    const nested = readNestedRecord(payload, parentKey);

    if (!nested) {
      continue;
    }

    const value = readStringClaim(nested, childKeys);

    if (value) {
      return value;
    }
  }

  return null;
}

function readAgentIdClaim(payload: JwtPayload): string | null {
  return (
    readStringClaim(payload, [
      "passport_agent_id",
      "agent_id",
      "agentId",
      "kite_agent_id"
    ]) ??
    readNestedStringClaim(payload, ["agent", "passport_agent"], [
      "id",
      "agent_id",
      "agentId"
    ])
  );
}

function readPayerAddressClaim(payload: JwtPayload): string | null {
  const candidate =
    readStringClaim(payload, [
      "passport_payer_addr",
      "payer_addr",
      "payer_address",
      "payerAddress",
      "wallet_address",
      "walletAddress",
      "user_wallet",
      "userWallet",
      "aa_wallet_address",
      "smart_wallet_address"
    ]) ??
    readNestedStringClaim(payload, ["wallet", "payer", "account"], [
      "address",
      "wallet_address",
      "payer_addr",
      "payer_address"
    ]);

  return candidate && isAddress(candidate) ? getAddress(candidate) : null;
}

async function loadJwks(jwksUrl: string): Promise<NodeJsonWebKey[]> {
  const now = Date.now();

  if (
    jwksCache &&
    jwksCache.url === jwksUrl &&
    now - jwksCache.fetchedAt < JWKS_CACHE_MS
  ) {
    return jwksCache.keys;
  }

  const response = await fetch(jwksUrl);
  if (!response.ok) {
    throw new PassportAuthError(
      `Failed to load Passport JWKS: HTTP ${response.status}.`,
      "PASSPORT_TOKEN_INVALID"
    );
  }

  const payload = (await response.json()) as JsonWebKeySet;
  if (!Array.isArray(payload.keys)) {
    throw new PassportAuthError(
      "Passport JWKS response is invalid.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  jwksCache = {
    url: jwksUrl,
    keys: payload.keys,
    fetchedAt: now
  };

  return payload.keys;
}

export async function verifyPassportBearerToken(
  token: string,
  options: {
    issuer?: string;
    jwksUrl?: string;
    now?: Date;
  } = {}
): Promise<PassportIdentity> {
  if (!token || token.trim() === "") {
    throw new PassportAuthError(
      "Passport bearer token is required.",
      "PASSPORT_AUTH_REQUIRED"
    );
  }

  const issuer =
    options.issuer ??
    process.env.KITE_PASSPORT_ISSUER ??
    "https://passport.prod.gokite.ai";
  const jwksUrl =
    options.jwksUrl ??
    process.env.KITE_PASSPORT_JWKS_URL ??
    `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new PassportAuthError(
      "Passport bearer token must be a JWT.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: JwtHeader;
  let payload: JwtPayload;

  try {
    header = base64UrlDecodeJson<JwtHeader>(encodedHeader);
    payload = base64UrlDecodeJson<JwtPayload>(encodedPayload);
  } catch {
    throw new PassportAuthError(
      "Passport bearer token could not be decoded.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  if (header.alg !== "RS256") {
    throw new PassportAuthError(
      "Passport bearer token must be signed with RS256.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  const keys = await loadJwks(jwksUrl);
  const key = header.kid
    ? keys.find((candidate) => candidate.kid === header.kid)
    : keys.length === 1
      ? keys[0]
      : undefined;

  if (!key) {
    throw new PassportAuthError(
      "Passport signing key was not found.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  const publicKey = createPublicKey({
    key,
    format: "jwk"
  });
  const verified = verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    Buffer.from(
      encodedSignature.padEnd(
        encodedSignature.length + ((4 - (encodedSignature.length % 4)) % 4),
        "="
      ).replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    )
  );

  if (!verified) {
    throw new PassportAuthError(
      "Passport bearer token signature is invalid.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  if (payload.iss !== issuer) {
    throw new PassportAuthError(
      "Passport bearer token issuer is invalid.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  if (!payload.sub) {
    throw new PassportAuthError(
      "Passport bearer token subject is missing.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (typeof payload.exp === "number" && payload.exp <= nowSeconds) {
    throw new PassportAuthError(
      "Passport bearer token has expired.",
      "PASSPORT_TOKEN_EXPIRED"
    );
  }

  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds) {
    throw new PassportAuthError(
      "Passport bearer token is not valid yet.",
      "PASSPORT_TOKEN_INVALID"
    );
  }

  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    issuer,
    agentId: readAgentIdClaim(payload),
    payerAddress: readPayerAddressClaim(payload)
  };
}
