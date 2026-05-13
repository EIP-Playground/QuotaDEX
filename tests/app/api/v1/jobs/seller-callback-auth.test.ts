import {
  executeEscrowGatewayAction,
  readEscrowPaymentState
} from "@/lib/chain/escrow";
import { buildSellerCallbackMessage } from "@/lib/seller-callback-auth";
import { createSellerSessionToken } from "@/lib/seller-session";
import {
  loadJobSnapshot,
  logJobEvent,
  recordJobPaymentTransition,
  setSellerIdleAfterExecution,
  updateJobStatusForSeller
} from "@/lib/jobs";
import { POST as completeJob } from "@/app/api/v1/jobs/[id]/complete/route";
import { POST as failJob } from "@/app/api/v1/jobs/[id]/fail/route";
import { POST as startJob } from "@/app/api/v1/jobs/[id]/start/route";
import { privateKeyToAccount } from "viem/accounts";

vi.mock("@/lib/chain/escrow", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/chain/escrow")>(
      "@/lib/chain/escrow"
    );

  return {
    ...actual,
    executeEscrowGatewayAction: vi.fn(),
    readEscrowPaymentState: vi.fn(),
    looksLikeOnChainTxHash: vi.fn(() => true)
  };
});

vi.mock("@/lib/jobs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jobs")>("@/lib/jobs");

  return {
    ...actual,
    loadJobSnapshot: vi.fn(),
    logJobEvent: vi.fn(),
    recordJobPaymentTransition: vi.fn(),
    setSellerIdleAfterExecution: vi.fn(),
    updateJobStatusForSeller: vi.fn()
  };
});

describe("seller job callbacks", () => {
  const sellerAccount = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  );
  const sellerId = sellerAccount.address;
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
    process.env.ALLOW_SELLER_SIGNATURE_AUTH = "true";

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
    vi.mocked(readEscrowPaymentState).mockResolvedValue("funded");
    vi.mocked(setSellerIdleAfterExecution).mockResolvedValue(true);
    vi.mocked(logJobEvent).mockResolvedValue(undefined);
    vi.mocked(recordJobPaymentTransition).mockResolvedValue(undefined);
  });

  async function signedBody(action: "start" | "complete" | "fail", jobId = "job-1") {
    const signedAt = new Date().toISOString();
    const message = buildSellerCallbackMessage({
      action,
      jobId,
      sellerId,
      signedAt
    });

    return {
      seller_id: sellerId,
      seller_signature: await sellerAccount.signMessage({ message }),
      seller_signed_at: signedAt
    };
  }

  async function sellerSessionHeader() {
    const token = await createSellerSessionToken(
      {
        sellerId,
        passportAgentId: "agent-seller-1",
        passportSubject: "user_123"
      },
      "salt"
    );

    return {
      authorization: `Bearer ${token}`
    };
  }

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

  it("starts a job with a Gateway seller session token instead of an EVM signature", async () => {
    vi.mocked(loadJobSnapshot).mockResolvedValue({
      ...runningJob,
      status: "paid"
    } as never);
    vi.mocked(updateJobStatusForSeller).mockResolvedValue({
      id: "job-1",
      seller_id: sellerId,
      status: "running",
      result: null
    });

    const response = await startJob(
      new Request("https://quotadex.test/api/v1/jobs/job-1/start", {
        method: "POST",
        headers: await sellerSessionHeader(),
        body: JSON.stringify({ seller_id: sellerId })
      }),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("running");
    expect(updateJobStatusForSeller).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        sellerId,
        expectedStatus: "paid",
        nextStatus: "running"
      })
    );
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

  it("skips escrow release for mock jobs even when tx_hash looks on-chain", async () => {
    vi.mocked(loadJobSnapshot).mockResolvedValue({
      ...runningJob,
      payment_mode: "mock"
    } as never);

    const response = await completeJob(
      new Request("https://quotadex.test/api/v1/jobs/job-1/complete", {
        method: "POST",
        body: JSON.stringify({
          ...(await signedBody("complete")),
          result: { ok: true }
        })
      }),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.release).toEqual({
      status: "skipped",
      reason: "mock_payment"
    });
    expect(executeEscrowGatewayAction).not.toHaveBeenCalled();
    expect(recordJobPaymentTransition).not.toHaveBeenCalled();
  });

  it("does not mark an x402 job done when escrow release fails", async () => {
    vi.mocked(executeEscrowGatewayAction).mockRejectedValue(
      new Error("release reverted")
    );

    const response = await completeJob(
      new Request("https://quotadex.test/api/v1/jobs/job-1/complete", {
        method: "POST",
        body: JSON.stringify({
          ...(await signedBody("complete")),
          result: { ok: true }
        })
      }),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("ESCROW_RELEASE_FAILED");
    expect(updateJobStatusForSeller).not.toHaveBeenCalled();
    expect(recordJobPaymentTransition).not.toHaveBeenCalled();
    expect(setSellerIdleAfterExecution).not.toHaveBeenCalled();
  });

  it("skips escrow refund for mock jobs even when tx_hash looks on-chain", async () => {
    vi.mocked(loadJobSnapshot).mockResolvedValue({
      ...runningJob,
      payment_mode: "mock"
    } as never);
    vi.mocked(updateJobStatusForSeller).mockResolvedValue({
      id: "job-1",
      seller_id: sellerId,
      status: "failed",
      result: { error: "failed" }
    });

    const response = await failJob(
      new Request("https://quotadex.test/api/v1/jobs/job-1/fail", {
        method: "POST",
        body: JSON.stringify({
          ...(await signedBody("fail")),
          error: "failed"
        })
      }),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.refund).toEqual({
      status: "skipped",
      reason: "mock_payment"
    });
    expect(executeEscrowGatewayAction).not.toHaveBeenCalled();
    expect(recordJobPaymentTransition).not.toHaveBeenCalled();
  });

  it("does not mark an x402 job failed when escrow refund fails", async () => {
    vi.mocked(executeEscrowGatewayAction).mockRejectedValue(
      new Error("refund reverted")
    );

    const response = await failJob(
      new Request("https://quotadex.test/api/v1/jobs/job-1/fail", {
        method: "POST",
        body: JSON.stringify({
          ...(await signedBody("fail")),
          error: "failed"
        })
      }),
      { params: Promise.resolve({ id: "job-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("ESCROW_REFUND_FAILED");
    expect(updateJobStatusForSeller).not.toHaveBeenCalled();
    expect(recordJobPaymentTransition).not.toHaveBeenCalled();
    expect(setSellerIdleAfterExecution).not.toHaveBeenCalled();
  });
});
