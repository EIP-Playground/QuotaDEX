import { buildFingerprint } from "@/lib/fingerprint";
import {
  executeEscrowGatewayAction,
  recoverExcessEscrowPaymentToken,
  registerFacilitatorEscrowPayment,
  verifyFacilitatorSettlementReceipt
} from "@/lib/chain/escrow";
import {
  settleFacilitatorPayment,
  verifyFacilitatorPayment
} from "@/lib/chain/facilitator";
import {
  createSettlingJob,
  deleteJob,
  deleteQuoteContext,
  finalizeSettlingJobPayment,
  loadQuoteContext,
  markSellerBusyForPayment,
  setSellerIdleAfterExecution
} from "@/lib/jobs";
import { createServerSupabaseClient } from "@/lib/supabase";
import { POST } from "@/app/api/v1/jobs/verify/route";

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

vi.mock("@/lib/chain/facilitator", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/chain/facilitator")>(
      "@/lib/chain/facilitator"
    );

  return {
    ...actual,
    verifyFacilitatorPayment: vi.fn(),
    settleFacilitatorPayment: vi.fn()
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
    recoverExcessEscrowPaymentToken: vi.fn(),
    verifyEscrowDepositReceipt: vi.fn(),
    verifyFacilitatorSettlementReceipt: vi.fn(),
    registerFacilitatorEscrowPayment: vi.fn()
  };
});

vi.mock("@/lib/jobs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jobs")>("@/lib/jobs");

  return {
    ...actual,
    loadQuoteContext: vi.fn(),
    createSettlingJob: vi.fn(),
    deleteJob: vi.fn(),
    deleteQuoteContext: vi.fn(),
    finalizeSettlingJobPayment: vi.fn(),
    markSellerBusyForPayment: vi.fn(),
    setSellerIdleAfterExecution: vi.fn()
  };
});

describe("POST /api/v1/jobs/verify", () => {
  const eventInsert = vi.fn();
  const buyerId = "0x6666666666666666666666666666666666666666";
  const sellerId = "0x5555555555555555555555555555555555555555";
  const payload = {
    buyer_id: buyerId,
    capability: "gpt-4o",
    prompt: "Summarize this document"
  };
  const fingerprint = buildFingerprint(
    {
      buyerId: payload.buyer_id,
      capability: payload.capability,
      prompt: payload.prompt
    },
    "salt"
  );
  const quoteContext = {
    payment_id: fingerprint,
    fingerprint,
    buyer_id: buyerId,
    seller_id: sellerId,
    seller_reserved_at: "2026-05-12T10:00:00.000Z",
    capability: "gpt-4o",
    amount: "0.005",
    amount_atomic: "5000000000000000",
    currency: "USDT",
    payment_mode: "x402-escrow",
    payment_asset: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
    pay_to: "0x4444444444444444444444444444444444444444",
    network: "kite-testnet",
    created_at: "2026-05-12T10:00:00.000Z",
    expires_at: "2026-05-12T10:05:00.000Z"
  };

  beforeEach(() => {
    vi.clearAllMocks();

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
    process.env.ALLOW_MOCK_PAYMENTS = "false";

    eventInsert.mockResolvedValue({ error: null });
    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: vi.fn(() => ({
        insert: eventInsert
      }))
    } as never);
    vi.mocked(loadQuoteContext).mockResolvedValue(quoteContext as never);
    vi.mocked(markSellerBusyForPayment).mockResolvedValue(true);
    vi.mocked(setSellerIdleAfterExecution).mockResolvedValue(true);
    vi.mocked(deleteQuoteContext).mockResolvedValue(undefined);
    vi.mocked(deleteJob).mockResolvedValue(undefined);
    vi.mocked(createSettlingJob).mockResolvedValue({
      id: "job-1",
      payment_id: fingerprint,
      status: "settling"
    });
    vi.mocked(finalizeSettlingJobPayment).mockResolvedValue({
      id: "job-1",
      payment_id: fingerprint,
      status: "paid"
    });
    vi.mocked(recoverExcessEscrowPaymentToken).mockResolvedValue({
      txHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    });
  });

  it("rejects production verification without an X-PAYMENT header", async () => {
    const response = await POST(
      new Request("https://quotadex.test/api/v1/jobs/verify", {
        method: "POST",
        body: JSON.stringify({
          fingerprint,
          tx_hash: "0xabc123",
          payload
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("X_PAYMENT_REQUIRED");
    expect(markSellerBusyForPayment).not.toHaveBeenCalled();
    expect(createSettlingJob).not.toHaveBeenCalled();
    expect(finalizeSettlingJobPayment).not.toHaveBeenCalled();
  });

  it("treats long tx_hash values as mock-only when mock payments are explicitly enabled", async () => {
    process.env.ALLOW_MOCK_PAYMENTS = "true";
    const longMockTxHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const response = await POST(
      new Request("https://quotadex.test/api/v1/jobs/verify", {
        method: "POST",
        body: JSON.stringify({
          fingerprint,
          tx_hash: longMockTxHash,
          payload
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      job_id: "job-1",
      status: "paid",
      payment_mode: "mock",
      settlement_tx_hash: null,
      escrow_registration_tx_hash: null
    });
    expect(finalizeSettlingJobPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: expect.objectContaining({
          mode: "mock"
        })
      })
    );
    expect(verifyFacilitatorPayment).not.toHaveBeenCalled();
    expect(registerFacilitatorEscrowPayment).not.toHaveBeenCalled();
  });

  it("claims the seller and records a settling intent before facilitator settlement", async () => {
    const verifyRequest = {
      fingerprint,
      tx_hash: null,
      payload
    };
    const xPayment = Buffer.from(
      JSON.stringify({
        authorization: {
          from: buyerId,
          to: quoteContext.pay_to,
          value: quoteContext.amount_atomic
        },
        signature: "0xsig",
        network: "kite-testnet"
      })
    ).toString("base64");
    const settlementTxHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const escrowRegistrationTxHash =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    vi.mocked(verifyFacilitatorPayment).mockResolvedValue({ valid: true });
    vi.mocked(settleFacilitatorPayment).mockResolvedValue({
      success: true,
      txHash: settlementTxHash
    });
    vi.mocked(verifyFacilitatorSettlementReceipt).mockResolvedValue(undefined);
    vi.mocked(registerFacilitatorEscrowPayment).mockResolvedValue({
      txHash: escrowRegistrationTxHash
    });

    const response = await POST(
      new Request("https://quotadex.test/api/v1/jobs/verify", {
        method: "POST",
        headers: {
          "x-payment": xPayment
        },
        body: JSON.stringify(verifyRequest)
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      job_id: "job-1",
      status: "paid",
      payment_mode: "x402-escrow",
      settlement_tx_hash: settlementTxHash,
      escrow_registration_tx_hash: escrowRegistrationTxHash
    });
    expect(verifyFacilitatorSettlementReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash: settlementTxHash,
        paymentId: fingerprint,
        buyerId,
        amountAtomic: quoteContext.amount_atomic,
        tokenAddress: quoteContext.payment_asset,
        escrowAddress: quoteContext.pay_to,
        rpcUrl: "https://rpc-testnet.gokite.ai"
      })
    );
    expect(registerFacilitatorEscrowPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: fingerprint,
        buyerId,
        sellerId,
        amountAtomic: quoteContext.amount_atomic,
        settlementTxHash,
        rpcUrl: "https://rpc-testnet.gokite.ai",
        escrowAddress: quoteContext.pay_to
      })
    );
    expect(markSellerBusyForPayment).toHaveBeenCalledWith(quoteContext);
    expect(createSettlingJob).toHaveBeenCalledWith(
      expect.objectContaining({
        verifyRequest,
        quoteContext
      })
    );
    expect(
      vi.mocked(markSellerBusyForPayment).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(verifyFacilitatorPayment).mock.invocationCallOrder[0]);
    expect(
      vi.mocked(createSettlingJob).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(settleFacilitatorPayment).mock.invocationCallOrder[0]);
    expect(finalizeSettlingJobPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        payment: expect.objectContaining({
          mode: "x402-escrow",
          settlementTxHash,
          escrowRegistrationTxHash,
          buyerWalletAddress: buyerId,
          sellerWalletAddress: sellerId
        })
      })
    );
  });

  it("does not call the facilitator when the seller reservation is stale", async () => {
    const xPayment = Buffer.from(
      JSON.stringify({
        authorization: {
          from: buyerId,
          to: quoteContext.pay_to,
          value: quoteContext.amount_atomic
        },
        signature: "0xsig",
        network: "kite-testnet"
      })
    ).toString("base64");

    vi.mocked(markSellerBusyForPayment).mockResolvedValue(false);

    const response = await POST(
      new Request("https://quotadex.test/api/v1/jobs/verify", {
        method: "POST",
        headers: {
          "x-payment": xPayment
        },
        body: JSON.stringify({
          fingerprint,
          tx_hash: null,
          payload
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("QUOTE_EXPIRED");
    expect(verifyFacilitatorPayment).not.toHaveBeenCalled();
    expect(settleFacilitatorPayment).not.toHaveBeenCalled();
    expect(registerFacilitatorEscrowPayment).not.toHaveBeenCalled();
    expect(createSettlingJob).not.toHaveBeenCalled();
  });

  it("cleans up the settling job, quote, and seller when facilitator verify rejects", async () => {
    const xPayment = Buffer.from(
      JSON.stringify({
        authorization: {
          from: buyerId,
          to: quoteContext.pay_to,
          value: quoteContext.amount_atomic
        },
        signature: "0xsig",
        network: "kite-testnet"
      })
    ).toString("base64");

    vi.mocked(verifyFacilitatorPayment).mockResolvedValue({
      valid: false,
      error: "bad payment"
    });

    const response = await POST(
      new Request("https://quotadex.test/api/v1/jobs/verify", {
        method: "POST",
        headers: {
          "x-payment": xPayment
        },
        body: JSON.stringify({
          fingerprint,
          tx_hash: null,
          payload
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("FACILITATOR_RESPONSE_INVALID");
    expect(deleteJob).toHaveBeenCalledWith("job-1");
    expect(setSellerIdleAfterExecution).toHaveBeenCalledWith(sellerId);
    expect(deleteQuoteContext).toHaveBeenCalledWith(fingerprint);
    expect(finalizeSettlingJobPayment).not.toHaveBeenCalled();
    expect(recoverExcessEscrowPaymentToken).not.toHaveBeenCalled();
  });

  it("recovers settled but unregistered escrow funds when registration fails", async () => {
    const xPayment = Buffer.from(
      JSON.stringify({
        authorization: {
          from: buyerId,
          to: quoteContext.pay_to,
          value: quoteContext.amount_atomic
        },
        signature: "0xsig",
        network: "kite-testnet"
      })
    ).toString("base64");
    const settlementTxHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    vi.mocked(verifyFacilitatorPayment).mockResolvedValue({ valid: true });
    vi.mocked(settleFacilitatorPayment).mockResolvedValue({
      success: true,
      txHash: settlementTxHash
    });
    vi.mocked(verifyFacilitatorSettlementReceipt).mockResolvedValue(undefined);
    vi.mocked(registerFacilitatorEscrowPayment).mockRejectedValue(
      new Error("registration failed")
    );

    const response = await POST(
      new Request("https://quotadex.test/api/v1/jobs/verify", {
        method: "POST",
        headers: {
          "x-payment": xPayment
        },
        body: JSON.stringify({
          fingerprint,
          tx_hash: null,
          payload
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("PAYMENT_VERIFY_FAILED");
    expect(recoverExcessEscrowPaymentToken).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientAddress: buyerId,
        amountAtomic: quoteContext.amount_atomic,
        escrowAddress: quoteContext.pay_to
      })
    );
    expect(deleteJob).toHaveBeenCalledWith("job-1");
    expect(setSellerIdleAfterExecution).toHaveBeenCalledWith(sellerId);
    expect(deleteQuoteContext).toHaveBeenCalledWith(fingerprint);
    expect(finalizeSettlingJobPayment).not.toHaveBeenCalled();
  });

  it("attempts escrow refund compensation if local finalization fails after registration", async () => {
    const xPayment = Buffer.from(
      JSON.stringify({
        authorization: {
          from: buyerId,
          to: quoteContext.pay_to,
          value: quoteContext.amount_atomic
        },
        signature: "0xsig",
        network: "kite-testnet"
      })
    ).toString("base64");
    const settlementTxHash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const escrowRegistrationTxHash =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    vi.mocked(verifyFacilitatorPayment).mockResolvedValue({ valid: true });
    vi.mocked(settleFacilitatorPayment).mockResolvedValue({
      success: true,
      txHash: settlementTxHash
    });
    vi.mocked(verifyFacilitatorSettlementReceipt).mockResolvedValue(undefined);
    vi.mocked(registerFacilitatorEscrowPayment).mockResolvedValue({
      txHash: escrowRegistrationTxHash
    });
    vi.mocked(finalizeSettlingJobPayment).mockRejectedValue(new Error("database down"));
    vi.mocked(executeEscrowGatewayAction).mockResolvedValue({
      txHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    });

    const response = await POST(
      new Request("https://quotadex.test/api/v1/jobs/verify", {
        method: "POST",
        headers: {
          "x-payment": xPayment
        },
        body: JSON.stringify({
          fingerprint,
          tx_hash: null,
          payload
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe("JOB_FINALIZE_FAILED");
    expect(executeEscrowGatewayAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "refund",
        paymentId: fingerprint,
        escrowAddress: quoteContext.pay_to
      })
    );
  });
});
