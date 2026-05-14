import {
  createPublicClient,
  encodeAbiParameters,
  encodeEventTopics,
  type Address
} from "viem";
import {
  erc20TransferEventAbi,
  verifyFacilitatorSettlementReceipt
} from "@/lib/chain/escrow";

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");

  return {
    ...actual,
    createPublicClient: vi.fn()
  };
});

describe("verifyFacilitatorSettlementReceipt", () => {
  const buyer = "0x6666666666666666666666666666666666666666" as Address;
  const escrow = "0x4444444444444444444444444444444444444444" as Address;
  const token = "0x7777777777777777777777777777777777777777" as Address;
  const txHash =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const getTransactionReceipt = vi.fn();

  function transferLog(params: {
    tokenAddress?: Address;
    from?: Address;
    to?: Address;
    value?: bigint;
  }) {
    return {
      address: params.tokenAddress ?? token,
      topics: encodeEventTopics({
        abi: erc20TransferEventAbi,
        eventName: "Transfer",
        args: {
          from: params.from ?? buyer,
          to: params.to ?? escrow
        }
      }),
      data: encodeAbiParameters(
        [
          {
            type: "uint256"
          }
        ],
        [params.value ?? BigInt(10000)]
      )
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createPublicClient).mockReturnValue({
      getTransactionReceipt
    } as never);
  });

  it("accepts a successful ERC20 transfer into the quote escrow for the exact amount", async () => {
    getTransactionReceipt.mockResolvedValue({
      status: "success",
      logs: [transferLog({})]
    });

    await expect(
      verifyFacilitatorSettlementReceipt({
        txHash,
        paymentId: txHash,
        buyerId: buyer,
        amountAtomic: "10000",
        rpcUrl: "https://rpc.gokite.ai/",
        tokenAddress: token,
        escrowAddress: escrow
      })
    ).resolves.toBeUndefined();
  });

  it("rejects direct transfers with the wrong amount", async () => {
    getTransactionReceipt.mockResolvedValue({
      status: "success",
      logs: [transferLog({ value: BigInt(9999) })]
    });

    await expect(
      verifyFacilitatorSettlementReceipt({
        txHash,
        paymentId: txHash,
        buyerId: buyer,
        amountAtomic: "10000",
        rpcUrl: "https://rpc.gokite.ai/",
        tokenAddress: token,
        escrowAddress: escrow
      })
    ).rejects.toMatchObject({
      code: "TX_TOKEN_TRANSFER_MISMATCH"
    });
  });

  it("rejects direct transfers from a different buyer", async () => {
    getTransactionReceipt.mockResolvedValue({
      status: "success",
      logs: [
        transferLog({
          from: "0x9999999999999999999999999999999999999999" as Address
        })
      ]
    });

    await expect(
      verifyFacilitatorSettlementReceipt({
        txHash,
        paymentId: txHash,
        buyerId: buyer,
        amountAtomic: "10000",
        rpcUrl: "https://rpc.gokite.ai/",
        tokenAddress: token,
        escrowAddress: escrow
      })
    ).rejects.toMatchObject({
      code: "TX_TOKEN_TRANSFER_MISMATCH"
    });
  });

  it("rejects direct transfers emitted by a different token contract", async () => {
    getTransactionReceipt.mockResolvedValue({
      status: "success",
      logs: [
        transferLog({
          tokenAddress: "0x9999999999999999999999999999999999999999" as Address
        })
      ]
    });

    await expect(
      verifyFacilitatorSettlementReceipt({
        txHash,
        paymentId: txHash,
        buyerId: buyer,
        amountAtomic: "10000",
        rpcUrl: "https://rpc.gokite.ai/",
        tokenAddress: token,
        escrowAddress: escrow
      })
    ).rejects.toMatchObject({
      code: "TX_TOKEN_TRANSFER_MISSING"
    });
  });
});
