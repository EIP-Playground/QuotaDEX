import { privateKeyToAccount } from "viem/accounts";
import { buildSellerCallbackMessage } from "@/lib/seller-callback-auth";
import { createSellerSessionToken } from "@/lib/seller-session";
import { createServerSupabaseClient } from "@/lib/supabase";
import { POST } from "@/app/api/v1/sellers/jobs/route";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

describe("POST /api/v1/sellers/jobs", () => {
  const sellerAccount = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  );
  const sellerId = sellerAccount.address;
  const limit = vi.fn();
  const order = vi.fn(() => ({ limit }));
  const inFilter = vi.fn(() => ({ order }));
  const eq = vi.fn(() => ({ in: inFilter }));
  const select = vi.fn(() => ({ eq }));

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "redis";
    process.env.GATEWAY_SALT = "salt";
    process.env.KITE_NETWORK = "kite-testnet";
    process.env.KITE_CHAIN_ID = "2368";
    process.env.KITE_RPC_URL = "https://rpc-testnet.gokite.ai";
    process.env.KITE_EXPLORER_URL = "https://testnet.kitescan.ai";
    process.env.PIEVERSE_FACILITATOR_BASE_URL = "https://facilitator.pieverse.io";
    process.env.KITE_PAYMENT_ASSET_ADDRESS =
      "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
    process.env.PAYMENT_TOKEN_DECIMALS = "18";
    process.env.PAYMENT_CURRENCY = "USDT";
    process.env.ESCROW_CONTRACT_ADDRESS =
      "0x4444444444444444444444444444444444444444";
    process.env.GATEWAY_PRIVATE_KEY =
      "0x1111111111111111111111111111111111111111111111111111111111111111";
    process.env.GATEWAY_SALT = "seller-session-secret";

    limit.mockResolvedValue({
      data: [
        {
          id: "job-1",
          payment_id: "payment-1",
          status: "paid",
          payload: {
            capability: "llama-3",
            prompt: "summarize this"
          },
          amount: "0.01",
          currency: "USDT",
          payment_mode: "x402-escrow",
          created_at: "2026-05-12T10:00:00.000Z",
          expires_at: "2026-05-12T10:05:00.000Z"
        }
      ],
      error: null
    });
    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: vi.fn(() => ({ select }))
    } as never);
  });

  async function signedPollBody() {
    const signedAt = new Date().toISOString();
    const message = buildSellerCallbackMessage({
      action: "poll",
      jobId: "seller-jobs",
      sellerId,
      signedAt
    });

    return {
      seller_id: sellerId,
      seller_signature: await sellerAccount.signMessage({ message }),
      seller_signed_at: signedAt
    };
  }

  it("rejects unsigned seller job polling", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/jobs", {
        method: "POST",
        body: JSON.stringify({ seller_id: sellerId })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("SELLER_SIGNATURE_INVALID");
    expect(select).not.toHaveBeenCalled();
  });

  it("returns paid and running jobs for the signed seller", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/jobs", {
        method: "POST",
        body: JSON.stringify(await signedPollBody())
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      seller_id: sellerId,
      jobs: [
        {
          job_id: "job-1",
          status: "paid",
          payload: {
            capability: "llama-3",
            prompt: "summarize this"
          }
        }
      ]
    });
    expect(eq).toHaveBeenCalledWith("seller_id", sellerId);
    expect(inFilter).toHaveBeenCalledWith("status", ["paid", "running"]);
  });

  it("returns jobs for a seller authorized by a Gateway seller session token", async () => {
    const token = await createSellerSessionToken(
      {
        sellerId,
        passportAgentId: "agent-seller-1",
        passportSubject: "user_123"
      },
      "seller-session-secret"
    );
    const response = await POST(
      new Request("https://quotadex.test/api/v1/sellers/jobs", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ seller_id: sellerId })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobs).toHaveLength(1);
    expect(eq).toHaveBeenCalledWith("seller_id", sellerId);
  });
});
