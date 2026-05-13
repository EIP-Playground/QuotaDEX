import { POST } from "@/app/api/v1/jobs/quote/route";
import { createRedisClient } from "@/lib/redis";
import { createServerSupabaseClient } from "@/lib/supabase";
import { reserveSellerForQuote } from "@/lib/jobs";

vi.mock("@/lib/redis", () => ({
  createRedisClient: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

vi.mock("@/lib/jobs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jobs")>("@/lib/jobs");

  return {
    ...actual,
    reserveSellerForQuote: vi.fn(),
    releaseReservedSeller: vi.fn()
  };
});

describe("POST /api/v1/jobs/quote", () => {
  const redisSet = vi.fn();
  const eventInsert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.KITE_NETWORK = "kite-testnet";
    process.env.KITE_CHAIN_ID = "2368";
    process.env.KITE_RPC_URL = "https://rpc-testnet.gokite.ai";
    process.env.KITE_EXPLORER_URL = "https://testnet.kitescan.ai";
    process.env.KITE_PAYMENT_ASSET_ADDRESS =
      "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
    process.env.PAYMENT_TOKEN_DECIMALS = "18";
    process.env.PAYMENT_CURRENCY = "USDT";
    process.env.ESCROW_CONTRACT_ADDRESS =
      "0x4444444444444444444444444444444444444444";
    process.env.GATEWAY_PUBLIC_BASE_URL = "https://gateway.quotadex.test";

    redisSet.mockResolvedValue(null);
    eventInsert.mockResolvedValue({ error: null });

    vi.mocked(createRedisClient).mockReturnValue({
      set: redisSet
    } as never);
    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: vi.fn(() => ({
        insert: eventInsert
      }))
    } as never);
    vi.mocked(reserveSellerForQuote).mockResolvedValue({
      id: "0x5555555555555555555555555555555555555555",
      capability: "gpt-4o",
      price_per_task: "0.005",
      reserved_at: "2026-05-12T10:00:00.000Z"
    });
  });

  it("quotes x402 escrow payment to the escrow contract in atomic Test USDT units", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/jobs/quote", {
        method: "POST",
        body: JSON.stringify({
          buyer_id: "0x6666666666666666666666666666666666666666",
          capability: "gpt-4o",
          prompt: "Summarize this document"
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload).toMatchObject({
      code: "PAYMENT_REQUIRED",
      payment_mode: "x402-escrow",
      pay_to: "0x4444444444444444444444444444444444444444",
      amount: "0.005",
      amount_atomic: "5000000000000000",
      currency: "USDT",
      network: "kite-testnet"
    });
    expect(payload.accepts[0]).toMatchObject({
      network: "kite-testnet",
      asset: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
      payTo: "0x4444444444444444444444444444444444444444",
      maxAmountRequired: "5000000000000000",
      resource: "https://gateway.quotadex.test/api/v1/jobs/verify"
    });
    expect(payload.accepts[0].extra).toMatchObject({
      payment_mode: "x402-escrow",
      escrow_contract: "0x4444444444444444444444444444444444444444",
      currency: "USDT",
      amount_atomic: "5000000000000000"
    });
  });
});
