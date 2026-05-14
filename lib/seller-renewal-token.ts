import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "qdr_";

export function createSellerRenewalToken() {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashSellerRenewalToken(token: string, secret: string) {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

export function verifySellerRenewalToken(params: {
  token: string | undefined;
  expectedHash: string | null;
  secret: string;
}) {
  if (!params.token || !params.expectedHash) {
    return false;
  }

  const actual = Buffer.from(
    hashSellerRenewalToken(params.token, params.secret)
  );
  const expected = Buffer.from(params.expectedHash);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
