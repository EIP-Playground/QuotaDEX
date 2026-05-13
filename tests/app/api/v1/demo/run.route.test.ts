import { transferDemoPaymentToEscrow, assertDemoEscrowConfig } from "@/lib/chain/demo";
import {
  executeEscrowGatewayAction,
  registerFacilitatorEscrowPayment,
  verifyFacilitatorSettlementReceipt
} from "@/lib/chain/escrow";
import {
  createSettlingJob,
  finalizeSettlingJobPayment,
  logJobEvent,
  recordJobPaymentTransition,
  setSellerIdleAfterExecution,
  updateJobStatusForSeller
} from "@/lib/jobs";
import { createRedisClient } from "@/lib/redis";
import { createServerSupabaseClient } from "@/lib/supabase";
import { POST } from "@/app/api/v1/demo/run/route";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

vi.mock("@/lib/redis", () => ({
  createRedisClient: vi.fn()
}));

vi.mock("@/lib/chain/demo", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/chain/demo")>(
      "@/lib/chain/demo"
    );

  return {
    ...actual,
    assertDemoEscrowConfig: vi.fn(),
    transferDemoPaymentToEscrow: vi.fn()
  };
});

vi.mock("@/lib/chain/escrow", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/chain/escrow")>(
      "@/lib/chain/escrow"
    );

  return {
    ...actual,
    executeEscrowGatewayAction: vi.fn(),
    registerFacilitatorEscrowPayment: vi.fn(),
    verifyFacilitatorSettlementReceipt: vi.fn()
  };
});

vi.mock("@/lib/jobs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jobs")>("@/lib/jobs");

  return {
    ...actual,
    createSettlingJob: vi.fn(),
    finalizeSettlingJobPayment: vi.fn(),
    logJobEvent: vi.fn(),
    recordJobPaymentTransition: vi.fn(),
    setSellerIdleAfterExecution: vi.fn(),
    updateJobStatusForSeller: vi.fn()
  };
});

describe("POST /api/v1/demo/run", () => {
  const sellerUpsert = vi.fn();
  const eventInsert = vi.fn();
  const redisGet = vi.fn();
  const redisIncr = vi.fn();
  const redisExpire = vi.fn();

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
    process.env.BUYER_PRIVATE_KEY =
      "0x2222222222222222222222222222222222222222222222222222222222222222";
    process.env.DEMO_SELLER_PRIVATE_KEY =
      "0x3333333333333333333333333333333333333333333333333333333333333333";

    sellerUpsert.mockResolvedValue({ error: null });
    eventInsert.mockResolvedValue({ error: null });
    redisGet.mockResolvedValue(null);
    redisIncr.mockResolvedValue(1);
    redisExpire.mockResolvedValue(1);
    vi.mocked(createRedisClient).mockReturnValue({
      get: redisGet,
      incr: redisIncr,
      expire: redisExpire
    } as never);
    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => ({
        upsert: table === "sellers" ? sellerUpsert : vi.fn(),
        insert: table === "events" ? eventInsert : vi.fn()
      }))
    } as never);

    vi.mocked(assertDemoEscrowConfig).mockResolvedValue(undefined);
    vi.mocked(transferDemoPaymentToEscrow).mockResolvedValue({
      txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });
    vi.mocked(verifyFacilitatorSettlementReceipt).mockResolvedValue(undefined);
    vi.mocked(registerFacilitatorEscrowPayment).mockResolvedValue({
      txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    });
    vi.mocked(createSettlingJob).mockResolvedValue({
      id: "job-demo",
      payment_id: "payment-demo",
      status: "settling"
    });
    vi.mocked(finalizeSettlingJobPayment).mockResolvedValue({
      id: "job-demo",
      payment_id: "payment-demo",
      status: "paid"
    });
    vi.mocked(updateJobStatusForSeller)
      .mockResolvedValueOnce({
        id: "job-demo",
        seller_id: "0x5CbDd86a2FA8Dc4bDdd8a8f69dBa48572EeC07FB",
        status: "running",
        result: null
      })
      .mockResolvedValueOnce({
        id: "job-demo",
        seller_id: "0x5CbDd86a2FA8Dc4bDdd8a8f69dBa48572EeC07FB",
        status: "done",
        result: { text: "demo result" }
      });
    vi.mocked(executeEscrowGatewayAction).mockResolvedValue({
      txHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    });
    vi.mocked(recordJobPaymentTransition).mockResolvedValue(undefined);
    vi.mocked(setSellerIdleAfterExecution).mockResolvedValue(true);
    vi.mocked(logJobEvent).mockResolvedValue(undefined);
  });

  it("rejects the demo when the buyer private key is missing", async () => {
    delete process.env.BUYER_PRIVATE_KEY;

    const response = await POST(
      new Request("https://quotadex.test/api/v1/demo/run", {
        method: "POST",
        body: JSON.stringify({
          capability: "llama-3",
          prompt: "hello"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("DEMO_CONFIG_MISSING");
    expect(transferDemoPaymentToEscrow).not.toHaveBeenCalled();
  });

  it("runs a testnet escrow happy path and releases funds to the seller", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/demo/run", {
        method: "POST",
        body: JSON.stringify({
          capability: "llama-3",
          prompt: "hello demo"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "done",
      payment_mode: "demo-direct-escrow",
      quote: {
        pay_to: "0x4444444444444444444444444444444444444444",
        payment_asset: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
        currency: "USDT"
      },
      payment: {
        settlement_tx_hash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        escrow_registration_tx_hash:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        release_tx_hash:
          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      },
      job: {
        job_id: "job-demo",
        status: "done"
      }
    });
    expect(assertDemoEscrowConfig).toHaveBeenCalled();
    expect(transferDemoPaymentToEscrow).toHaveBeenCalledWith(
      expect.objectContaining({
        amountAtomic: expect.any(String),
        escrowAddress: "0x4444444444444444444444444444444444444444",
        tokenAddress: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63"
      })
    );
    expect(registerFacilitatorEscrowPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        settlementTxHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    );
    expect(executeEscrowGatewayAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "release"
      })
    );
    expect(recordJobPaymentTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: "released",
        releaseTxHash:
          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      })
    );
  });

  it("rate limits public demo runs before spending testnet funds", async () => {
    redisIncr.mockResolvedValue(4);

    const response = await POST(
      new Request("https://quotadex.test/api/v1/demo/run", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.8"
        },
        body: JSON.stringify({
          capability: "llama-3",
          prompt: "hello demo"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.code).toBe("DEMO_RATE_LIMITED");
    expect(transferDemoPaymentToEscrow).not.toHaveBeenCalled();
    expect(registerFacilitatorEscrowPayment).not.toHaveBeenCalled();
  });

  it("refunds escrow and releases the seller when finalization fails after registration", async () => {
    vi.mocked(finalizeSettlingJobPayment).mockRejectedValue(new Error("database down"));

    const response = await POST(
      new Request("https://quotadex.test/api/v1/demo/run", {
        method: "POST",
        body: JSON.stringify({
          capability: "llama-3",
          prompt: "hello demo"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("DEMO_RUN_FAILED");
    expect(executeEscrowGatewayAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "refund"
      })
    );
    expect(recordJobPaymentTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: "refunded"
      })
    );
    expect(setSellerIdleAfterExecution).toHaveBeenCalled();
  });

  it("retries final job completion after release succeeds", async () => {
    vi.mocked(updateJobStatusForSeller)
      .mockReset()
      .mockResolvedValueOnce({
        id: "job-demo",
        seller_id: "0x5CbDd86a2FA8Dc4bDdd8a8f69dBa48572EeC07FB",
        status: "running",
        result: null
      })
      .mockRejectedValueOnce(new Error("completion update down"))
      .mockResolvedValueOnce({
        id: "job-demo",
        seller_id: "0x5CbDd86a2FA8Dc4bDdd8a8f69dBa48572EeC07FB",
        status: "done",
        result: { text: "demo result" }
      });

    const response = await POST(
      new Request("https://quotadex.test/api/v1/demo/run", {
        method: "POST",
        body: JSON.stringify({
          capability: "llama-3",
          prompt: "hello demo"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("done");
    expect(updateJobStatusForSeller).toHaveBeenCalledTimes(3);
    expect(executeEscrowGatewayAction).toHaveBeenCalledTimes(1);
    expect(executeEscrowGatewayAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "release"
      })
    );
  });
});
