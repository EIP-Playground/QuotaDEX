import { createServerSupabaseClient } from "@/lib/supabase";
import { POST } from "@/app/api/v1/sellers/session/challenge/route";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

describe("POST /api/v1/sellers/session/challenge", () => {
  const sellerId = "0x5555555555555555555555555555555555555555";
  const sellerMaybeSingle = vi.fn();
  const sellerSelectQuery = {
    eq: vi.fn(() => sellerSelectQuery),
    maybeSingle: sellerMaybeSingle
  };
  const sellerSelect = vi.fn(() => sellerSelectQuery);
  const challengeSingle = vi.fn();
  const challengeSelect = vi.fn(() => ({ single: challengeSingle }));
  const challengeInsert = vi.fn(() => ({ select: challengeSelect }));
  const from = vi.fn((table: string) => {
    if (table === "seller_auth_challenges") {
      return { insert: challengeInsert };
    }

    return { select: sellerSelect };
  });

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.SELLER_BOND_RECEIVER_ADDRESS =
      "0x7777777777777777777777777777777777777777";
    process.env.SELLER_BOND_TOKEN_ADDRESS =
      "0x8888888888888888888888888888888888888888";
    process.env.SELLER_BOND_TOKEN_SYMBOL = "USDC";
    process.env.SELLER_BOND_AMOUNT = "0.01";
    process.env.SELLER_BOND_TOKEN_DECIMALS = "18";

    sellerMaybeSingle.mockResolvedValue({
      data: {
        id: sellerId,
        approval_status: "approved"
      },
      error: null
    });
    challengeSingle.mockResolvedValue({
      data: {
        id: "challenge-1",
        proof_receiver_address: "0x7777777777777777777777777777777777777777",
        proof_token_symbol: "USDC",
        amount_display: "0.010000000000000123",
        amount_atomic: "10000000000000123",
        expires_at: "2026-05-13T12:15:00.000Z"
      },
      error: null
    });
    vi.mocked(createServerSupabaseClient).mockReturnValue({ from } as never);
  });

  it("creates a seller bond challenge with kpass transfer instructions", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/session/challenge", {
        method: "POST",
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
      challenge_id: "challenge-1",
      to: "0x7777777777777777777777777777777777777777",
      asset: "USDC",
      amount: "0.010000000000000123",
      amount_atomic: "10000000000000123"
    });
    expect(body.kpass_command).toBe(
      "kpass wallet send --to 0x7777777777777777777777777777777777777777 --amount 0.010000000000000123 --asset USDC --output json"
    );
    expect(challengeInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        seller_id: sellerId,
        network_profile: "live-mainnet",
        passport_agent_id: "agent-seller-1",
        proof_receiver_address: "0x7777777777777777777777777777777777777777",
        proof_token_address: "0x8888888888888888888888888888888888888888",
        proof_token_symbol: "USDC",
        status: "pending"
      })
    );
  });
});
