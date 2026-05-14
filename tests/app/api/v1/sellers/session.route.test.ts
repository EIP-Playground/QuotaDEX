import { verifyPassportBearerToken } from "@/lib/passport-auth";
import { verifySellerBondTransferReceipt } from "@/lib/seller-bond";
import { verifySellerSessionToken } from "@/lib/seller-session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { POST } from "@/app/api/v1/sellers/session/route";

vi.mock("@/lib/passport-auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/passport-auth")>(
      "@/lib/passport-auth"
    );

  return {
    ...actual,
    verifyPassportBearerToken: vi.fn()
  };
});

vi.mock("@/lib/seller-bond", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/seller-bond")>(
      "@/lib/seller-bond"
    );

  return {
    ...actual,
    verifySellerBondTransferReceipt: vi.fn()
  };
});

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

describe("POST /api/v1/sellers/session", () => {
  const sellerId = "0x5555555555555555555555555555555555555555";
  const maybeSingle = vi.fn();
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    maybeSingle
  };
  const select = vi.fn(() => selectQuery);
  const bindMaybeSingle = vi.fn();
  const bindSelect = vi.fn(() => ({ maybeSingle: bindMaybeSingle }));
  const bindQuery = {
    eq: vi.fn(() => bindQuery),
    is: vi.fn(() => bindQuery),
    select: bindSelect
  };
  const update = vi.fn(() => bindQuery);
  const challengeMaybeSingle = vi.fn();
  const challengeSelectQuery = {
    eq: vi.fn(() => challengeSelectQuery),
    maybeSingle: challengeMaybeSingle
  };
  const challengeSelect = vi.fn(() => challengeSelectQuery);
  const challengeUpdateMaybeSingle = vi.fn();
  const challengeUpdateSelect = vi.fn(() => ({
    maybeSingle: challengeUpdateMaybeSingle
  }));
  const challengeUpdateQuery = {
    eq: vi.fn(() => challengeUpdateQuery),
    select: challengeUpdateSelect
  };
  const challengeUpdate = vi.fn(() => challengeUpdateQuery);
  const from = vi.fn((table: string) => {
    if (table === "seller_auth_challenges") {
      return {
        select: challengeSelect,
        update: challengeUpdate
      };
    }

    return { select, update };
  });

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.GATEWAY_SALT = "seller-session-secret";

    maybeSingle.mockResolvedValue({
      data: {
        id: sellerId,
        passport_agent_id: null,
        passport_payer_addr: sellerId,
        passport_subject: null,
        approval_status: "approved"
      },
      error: null
    });
    bindMaybeSingle.mockResolvedValue({
      data: { id: sellerId },
      error: null
    });
    challengeMaybeSingle.mockResolvedValue({
      data: {
        id: "challenge-1",
        seller_id: sellerId,
        passport_agent_id: "agent-seller-1",
        proof_receiver_address: "0x7777777777777777777777777777777777777777",
        proof_token_address: "0x8888888888888888888888888888888888888888",
        proof_token_symbol: "USDC",
        amount_atomic: "10000000000000000",
        amount_display: "0.01",
        network_profile: "live-mainnet",
        status: "pending",
        expires_at: new Date(Date.now() + 60_000).toISOString()
      },
      error: null
    });
    challengeUpdateMaybeSingle.mockResolvedValue({
      data: { id: "challenge-1" },
      error: null
    });
    vi.mocked(verifyPassportBearerToken).mockResolvedValue({
      subject: "user_123",
      email: "seller@example.com",
      issuer: "https://passport.prod.gokite.ai",
      agentId: "agent-seller-1",
      payerAddress: sellerId
    });
    vi.mocked(verifySellerBondTransferReceipt).mockResolvedValue(undefined);
    vi.mocked(createServerSupabaseClient).mockReturnValue({ from } as never);
  });

  it("rejects seller session creation without a Passport bearer token", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/session", {
        method: "POST",
        body: JSON.stringify({
          seller_id: sellerId,
          passport_agent_id: "agent-seller-1"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("PASSPORT_AUTH_REQUIRED");
  });

  it("verifies Passport identity and returns a signed Gateway seller session", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/session", {
        method: "POST",
        headers: {
          authorization: "Bearer passport.jwt"
        },
        body: JSON.stringify({
          seller_id: sellerId,
          passport_agent_id: "agent-seller-1"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      seller_id: sellerId,
      token_type: "Bearer"
    });
    expect(typeof body.seller_session_token).toBe("string");
    await expect(
      verifySellerSessionToken(body.seller_session_token, "seller-session-secret")
    ).resolves.toMatchObject({
      sellerId,
      passportAgentId: "agent-seller-1",
      passportSubject: "user_123",
      networkProfile: "live-mainnet"
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        passport_subject: "user_123",
        passport_email: "seller@example.com",
        passport_agent_id: "agent-seller-1",
        passport_payer_addr: sellerId
      })
    );
    expect(bindQuery.eq).toHaveBeenCalledWith("id", sellerId);
    expect(bindQuery.is).toHaveBeenCalledWith("passport_agent_id", null);
    expect(bindQuery.is).toHaveBeenCalledWith("passport_subject", null);
  });

  it("rejects Passport JWTs that do not carry verified seller binding claims", async () => {
    vi.mocked(verifyPassportBearerToken).mockResolvedValue({
      subject: "user_123",
      email: "seller@example.com",
      issuer: "https://passport.prod.gokite.ai",
      agentId: null,
      payerAddress: null
    });

    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/session", {
        method: "POST",
        headers: {
          authorization: "Bearer passport.jwt"
        },
        body: JSON.stringify({
          seller_id: sellerId,
          passport_agent_id: "agent-seller-1"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("PASSPORT_TOKEN_INVALID");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a Passport payer address that does not match the seller id", async () => {
    vi.mocked(verifyPassportBearerToken).mockResolvedValue({
      subject: "user_123",
      email: "seller@example.com",
      issuer: "https://passport.prod.gokite.ai",
      agentId: "agent-seller-1",
      payerAddress: "0x6666666666666666666666666666666666666666"
    });

    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/session", {
        method: "POST",
        headers: {
          authorization: "Bearer passport.jwt"
        },
        body: JSON.stringify({
          seller_id: sellerId,
          passport_agent_id: "agent-seller-1"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("SELLER_PASSPORT_MISMATCH");
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts a verified seller bond transfer instead of a Passport JWT", async () => {
    const txHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/session", {
        method: "POST",
        body: JSON.stringify({
          seller_id: sellerId,
          passport_agent_id: "agent-seller-1",
          challenge_id: "challenge-1",
          tx_hash: txHash
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      seller_id: sellerId,
      token_type: "Bearer",
      auth_method: "seller_bond"
    });
    await expect(
      verifySellerSessionToken(body.seller_session_token, "seller-session-secret")
    ).resolves.toMatchObject({
      sellerId,
      passportAgentId: "agent-seller-1",
      passportSubject: `wallet-proof:${sellerId.toLowerCase()}`,
      networkProfile: "live-mainnet"
    });
    expect(verifyPassportBearerToken).not.toHaveBeenCalled();
    expect(verifySellerBondTransferReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash,
        sellerId,
        receiverAddress: "0x7777777777777777777777777777777777777777",
        tokenAddress: "0x8888888888888888888888888888888888888888",
        amountAtomic: "10000000000000000"
      })
    );
    expect(challengeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "verified",
        tx_hash: txHash
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        passport_subject: `wallet-proof:${sellerId.toLowerCase()}`,
        passport_email: null,
        passport_agent_id: "agent-seller-1",
        passport_payer_addr: sellerId
      })
    );
  });
});
