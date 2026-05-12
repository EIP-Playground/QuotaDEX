import { executeEscrowGatewayAction } from "@/lib/chain/escrow";
import {
  loadJobSnapshot,
  logJobEvent,
  setSellerIdleAfterExecution,
  updateJobStatusForSeller
} from "@/lib/jobs";
import { POST as completeJob } from "@/app/api/v1/jobs/[id]/complete/route";
import { POST as failJob } from "@/app/api/v1/jobs/[id]/fail/route";
import { POST as startJob } from "@/app/api/v1/jobs/[id]/start/route";

vi.mock("@/lib/chain/escrow", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/chain/escrow")>(
      "@/lib/chain/escrow"
    );

  return {
    ...actual,
    executeEscrowGatewayAction: vi.fn(),
    looksLikeOnChainTxHash: vi.fn(() => true)
  };
});

vi.mock("@/lib/jobs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jobs")>("@/lib/jobs");

  return {
    ...actual,
    loadJobSnapshot: vi.fn(),
    logJobEvent: vi.fn(),
    setSellerIdleAfterExecution: vi.fn(),
    updateJobStatusForSeller: vi.fn()
  };
});

describe("seller job callbacks", () => {
  const sellerId = "0x5555555555555555555555555555555555555555";
  const runningJob = {
    id: "job-1",
    seller_id: sellerId,
    status: "running",
    payment_id: "payment-1",
    tx_hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    payment_mode: "x402-escrow",
    settlement_tx_hash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    escrow_registration_tx_hash:
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    payload: {},
    result: null
  };

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "redis";
    process.env.GATEWAY_SALT = "salt";
    process.env.KITE_PAYMENT_ASSET_ADDRESS =
      "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
    process.env.ESCROW_CONTRACT_ADDRESS =
      "0x4444444444444444444444444444444444444444";
    process.env.GATEWAY_PRIVATE_KEY =
      "0x1111111111111111111111111111111111111111111111111111111111111111";

    vi.mocked(loadJobSnapshot).mockResolvedValue(runningJob as never);
    vi.mocked(updateJobStatusForSeller).mockResolvedValue({
      id: "job-1",
      seller_id: sellerId,
      status: "done",
      result: {}
    });
    vi.mocked(executeEscrowGatewayAction).mockResolvedValue({
      txHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    });
    vi.mocked(setSellerIdleAfterExecution).mockResolvedValue(true);
    vi.mocked(logJobEvent).mockResolvedValue(undefined);
  });

  it("rejects start without a seller signature", async () => {
    vi.mocked(loadJobSnapshot).mockResolvedValue({
      ...runningJob,
      status: "paid"
    } as never);

    const response = await startJob(
      new Request("https://quotadex.test/api/v1/jobs/job-1/start", {
        method: "POST",
        body: JSON.stringify({ seller_id: sellerId })
      }),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("SELLER_SIGNATURE_INVALID");
    expect(updateJobStatusForSeller).not.toHaveBeenCalled();
  });

  it("rejects complete without a seller signature before escrow release", async () => {
    const response = await completeJob(
      new Request("https://quotadex.test/api/v1/jobs/job-1/complete", {
        method: "POST",
        body: JSON.stringify({ seller_id: sellerId, result: { ok: true } })
      }),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("SELLER_SIGNATURE_INVALID");
    expect(updateJobStatusForSeller).not.toHaveBeenCalled();
    expect(executeEscrowGatewayAction).not.toHaveBeenCalled();
  });

  it("rejects fail without a seller signature before escrow refund", async () => {
    const response = await failJob(
      new Request("https://quotadex.test/api/v1/jobs/job-1/fail", {
        method: "POST",
        body: JSON.stringify({ seller_id: sellerId, error: "failed" })
      }),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("SELLER_SIGNATURE_INVALID");
    expect(updateJobStatusForSeller).not.toHaveBeenCalled();
    expect(executeEscrowGatewayAction).not.toHaveBeenCalled();
  });
});
