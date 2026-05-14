import {
  getDashboardScope,
  getNetworkProfile,
  KITE_MAINNET_USDC_ADDRESS
} from "@/lib/network-profiles";
import { getServerEnv } from "@/lib/env";

describe("network profiles", () => {
  beforeEach(() => {
    process.env.LIVE_MAINNET_ESCROW_CONTRACT_ADDRESS =
      "0x9999999999999999999999999999999999999999";
  });

  it("keeps the one-click demo pinned to the existing Kite Testnet USDT escrow", () => {
    const profile = getNetworkProfile(getServerEnv(), "demo-testnet");

    expect(profile).toMatchObject({
      id: "demo-testnet",
      dashboardLabel: "Demo Testnet",
      network: "kite-testnet",
      chainId: "2368",
      paymentCurrency: "USDT",
      paymentTokenDecimals: "18",
      paymentAssetAddress: "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
      escrowContractAddress: "0x4444444444444444444444444444444444444444"
    });
  });

  it("defaults Live Mainnet to Kite Mainnet USDC.e while requiring the mainnet escrow address", () => {
    const profile = getNetworkProfile(getServerEnv(), "live-mainnet");

    expect(profile).toMatchObject({
      id: "live-mainnet",
      dashboardLabel: "Live Mainnet",
      network: "kite-mainnet",
      chainId: "2366",
      rpcUrl: "https://rpc.gokite.ai/",
      explorerUrl: "https://kitescan.ai",
      paymentCurrency: "USDC",
      paymentTokenDecimals: "6",
      paymentAssetAddress: KITE_MAINNET_USDC_ADDRESS,
      escrowContractAddress: "0x9999999999999999999999999999999999999999"
    });
  });

  it("maps Dashboard query modes to the intended monitoring profiles", () => {
    expect(getDashboardScope({ mode: "demo" })).toMatchObject({
      label: "Demo Testnet",
      currency: "USDT",
      networkProfiles: ["demo-testnet"]
    });
    expect(getDashboardScope({ mode: "live", network: "testnet" })).toMatchObject({
      label: "Live Testnet",
      currency: "USDC",
      networkProfiles: ["live-testnet"]
    });
    expect(getDashboardScope({ mode: "live", network: "mainnet" })).toMatchObject({
      label: "Live Mainnet",
      currency: "USDC",
      networkProfiles: ["live-mainnet"]
    });
  });
});
