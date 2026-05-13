import {
  createSign,
  generateKeyPairSync,
  type KeyObject,
  type JsonWebKey
} from "node:crypto";
import {
  verifyPassportBearerToken
} from "@/lib/passport-auth";

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(params: {
  privateKey: KeyObject;
  kid: string;
  payload: Record<string, unknown>;
}): string {
  const encodedHeader = base64UrlEncode(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      kid: params.kid
    })
  );
  const encodedPayload = base64UrlEncode(JSON.stringify(params.payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(params.privateKey);

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

describe("verifyPassportBearerToken", () => {
  const issuer = "https://passport.prod.gokite.ai";
  const jwksUrl = `${issuer}/.well-known/jwks.json`;
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });
  const publicJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          keys: [
            {
              ...publicJwk,
              kid: "kid-1",
              alg: "RS256",
              use: "sig"
            }
          ]
        })
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("verifies RS256 tokens and extracts Passport seller binding claims", async () => {
    const token = signJwt({
      privateKey,
      kid: "kid-1",
      payload: {
        iss: issuer,
        sub: "user_123",
        email: "seller@example.com",
        exp: 1_900_000_000,
        passport_agent_id: "agent-seller-1",
        payer_addr: "0x5555555555555555555555555555555555555555"
      }
    });

    await expect(
      verifyPassportBearerToken(token, {
        issuer,
        jwksUrl,
        now: new Date("2026-05-13T00:00:00.000Z")
      })
    ).resolves.toMatchObject({
      subject: "user_123",
      email: "seller@example.com",
      agentId: "agent-seller-1",
      payerAddress: "0x5555555555555555555555555555555555555555"
    });
  });

  it("rejects tokens whose kid does not exist in the Passport JWKS", async () => {
    const token = signJwt({
      privateKey,
      kid: "unknown-kid",
      payload: {
        iss: issuer,
        sub: "user_123",
        exp: 1_900_000_000
      }
    });

    await expect(
      verifyPassportBearerToken(token, {
        issuer,
        jwksUrl,
        now: new Date("2026-05-13T00:00:00.000Z")
      })
    ).rejects.toMatchObject({
      code: "PASSPORT_TOKEN_INVALID"
    });
  });
});
