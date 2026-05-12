import { privateKeyToAccount } from "viem/accounts";
import {
  assertValidSellerCallbackSignature,
  buildSellerCallbackMessage
} from "@/lib/seller-callback-auth";

describe("seller callback signatures", () => {
  it("accepts a fresh seller signature for the exact job action", async () => {
    const account = privateKeyToAccount(
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    );
    const signedAt = "2026-05-12T10:00:00.000Z";
    const message = buildSellerCallbackMessage({
      action: "complete",
      jobId: "job-1",
      sellerId: account.address,
      signedAt
    });
    const signature = await account.signMessage({ message });

    await expect(
      assertValidSellerCallbackSignature({
        action: "complete",
        jobId: "job-1",
        sellerId: account.address,
        signedAt,
        signature,
        rpcUrl: "https://rpc-testnet.gokite.ai",
        now: new Date("2026-05-12T10:01:00.000Z")
      })
    ).resolves.toBeUndefined();
  });

  it("rejects expired seller callback signatures", async () => {
    const account = privateKeyToAccount(
      "0x1111111111111111111111111111111111111111111111111111111111111111"
    );
    const signedAt = "2026-05-12T10:00:00.000Z";
    const message = buildSellerCallbackMessage({
      action: "start",
      jobId: "job-1",
      sellerId: account.address,
      signedAt
    });
    const signature = await account.signMessage({ message });

    await expect(
      assertValidSellerCallbackSignature({
        action: "start",
        jobId: "job-1",
        sellerId: account.address,
        signedAt,
        signature,
        rpcUrl: "https://rpc-testnet.gokite.ai",
        now: new Date("2026-05-12T10:10:01.000Z")
      })
    ).rejects.toThrow("seller_signature has expired");
  });
});
