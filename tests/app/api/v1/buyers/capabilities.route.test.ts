import { GET } from "@/app/api/v1/buyers/capabilities/route";
import { listQuoteEligibleCapabilities } from "@/lib/jobs";

vi.mock("@/lib/jobs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jobs")>("@/lib/jobs");

  return {
    ...actual,
    listQuoteEligibleCapabilities: vi.fn()
  };
});

describe("GET /api/v1/buyers/capabilities", () => {
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
    process.env.LIVE_MAINNET_ESCROW_CONTRACT_ADDRESS =
      "0x9999999999999999999999999999999999999999";
    process.env.GATEWAY_PUBLIC_BASE_URL = "https://gateway.quotadex.test";
  });

  it("returns quote-eligible capability inventory for Live Mainnet by default", async () => {
    vi.mocked(listQuoteEligibleCapabilities).mockResolvedValue([
      {
        capability: "deepseek-v4-pro",
        available_count: 1,
        min_price: "0.01000000"
      }
    ]);

    const response = await GET(
      new Request("https://quotadex.test/api/v1/buyers/capabilities")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listQuoteEligibleCapabilities).toHaveBeenCalledWith("live-mainnet");
    expect(payload).toMatchObject({
      network_profile: "live-mainnet",
      network: "kite-mainnet",
      currency: "USDC",
      capabilities: [
        {
          capability: "deepseek-v4-pro",
          available_count: 1,
          min_price: "0.01000000",
          currency: "USDC"
        }
      ]
    });
    expect(payload.updated_at).toEqual(expect.any(String));
    expect(Object.keys(payload).sort()).toEqual([
      "capabilities",
      "currency",
      "network",
      "network_profile",
      "updated_at"
    ]);
    expect(Object.keys(payload.capabilities[0]).sort()).toEqual([
      "available_count",
      "capability",
      "currency",
      "min_price"
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/seller_id|sellerId/);
  });

  it("supports Live Testnet capability discovery", async () => {
    process.env.LIVE_TESTNET_ESCROW_CONTRACT_ADDRESS =
      "0x8888888888888888888888888888888888888888";
    process.env.LIVE_TESTNET_PAYMENT_ASSET_ADDRESS =
      "0x7777777777777777777777777777777777777777";
    vi.mocked(listQuoteEligibleCapabilities).mockResolvedValue([]);

    const response = await GET(
      new Request(
        "https://quotadex.test/api/v1/buyers/capabilities?network_profile=live-testnet"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listQuoteEligibleCapabilities).toHaveBeenCalledWith("live-testnet");
    expect(payload).toMatchObject({
      network_profile: "live-testnet",
      network: "kite-testnet",
      currency: "USDC",
      capabilities: []
    });
  });

  it("rejects demo-testnet because buyer discovery is live-only", async () => {
    const response = await GET(
      new Request(
        "https://quotadex.test/api/v1/buyers/capabilities?network_profile=demo-testnet"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      code: "BUYER_CAPABILITIES_PROFILE_UNSUPPORTED"
    });
    expect(listQuoteEligibleCapabilities).not.toHaveBeenCalled();
  });
});
