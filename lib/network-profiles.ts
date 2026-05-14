import type { getServerEnv } from "@/lib/env";

export const KITE_TESTNET_USDT_ADDRESS =
  "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
export const KITE_MAINNET_USDC_ADDRESS =
  "0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e";

export const NETWORK_PROFILE_IDS = [
  "demo-testnet",
  "live-testnet",
  "live-mainnet"
] as const;

export type NetworkProfileId = (typeof NETWORK_PROFILE_IDS)[number];
export type DashboardMode = "demo" | "live";
export type LiveNetwork = "testnet" | "mainnet";

type ServerEnv = ReturnType<typeof getServerEnv>;

export type PaymentNetworkProfile = {
  id: NetworkProfileId;
  dashboardLabel: "Demo Testnet" | "Live Testnet" | "Live Mainnet";
  network: string;
  chainId: string;
  rpcUrl: string;
  explorerUrl: string;
  facilitatorBaseUrl: string;
  publicBaseUrl: string;
  paymentAssetAddress: string;
  paymentCurrency: string;
  paymentTokenDecimals: string;
  escrowContractAddress: string;
  gatewayPrivateKey: string;
  allowMockPayments: string;
};

export type DashboardScope = {
  mode: DashboardMode;
  network: LiveNetwork | "demo";
  label: "Demo Testnet" | "Live Testnet" | "Live Mainnet";
  currency: "USDT" | "USDC" | "USDT/USDC";
  networkProfiles: NetworkProfileId[];
};

export class NetworkProfileConfigError extends Error {
  constructor(
    message: string,
    readonly code = "NETWORK_PROFILE_CONFIG_INVALID"
  ) {
    super(message);
    this.name = "NetworkProfileConfigError";
  }
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];

  return value && value.trim() !== "" ? value.trim() : fallback;
}

function requireProfileEnv(
  name: string,
  profileId: NetworkProfileId,
  fallback?: string
): string {
  const value = process.env[name] ?? fallback;

  if (!value || value.trim() === "") {
    throw new NetworkProfileConfigError(
      `${name} is required for ${profileId}.`
    );
  }

  return value.trim();
}

export function isNetworkProfileId(value: string): value is NetworkProfileId {
  return (NETWORK_PROFILE_IDS as readonly string[]).includes(value);
}

export function parseNetworkProfileId(
  value: string | undefined,
  fallback: NetworkProfileId
): NetworkProfileId {
  if (!value) {
    return fallback;
  }

  if (!isNetworkProfileId(value)) {
    throw new Error(
      `network_profile must be one of ${NETWORK_PROFILE_IDS.join(", ")}.`
    );
  }

  return value;
}

export function getNetworkProfile(
  env: ServerEnv,
  profileId: NetworkProfileId
): PaymentNetworkProfile {
  if (profileId === "demo-testnet") {
    return {
      id: "demo-testnet",
      dashboardLabel: "Demo Testnet",
      network: optionalEnv("DEMO_KITE_NETWORK", env.KITE_NETWORK),
      chainId: optionalEnv("DEMO_KITE_CHAIN_ID", env.KITE_CHAIN_ID),
      rpcUrl: optionalEnv("DEMO_KITE_RPC_URL", env.KITE_RPC_URL),
      explorerUrl: optionalEnv("DEMO_KITE_EXPLORER_URL", env.KITE_EXPLORER_URL),
      facilitatorBaseUrl: optionalEnv(
        "DEMO_PIEVERSE_FACILITATOR_BASE_URL",
        env.PIEVERSE_FACILITATOR_BASE_URL
      ),
      publicBaseUrl: env.GATEWAY_PUBLIC_BASE_URL,
      paymentAssetAddress: optionalEnv(
        "DEMO_PAYMENT_ASSET_ADDRESS",
        env.KITE_PAYMENT_ASSET_ADDRESS
      ),
      paymentCurrency: optionalEnv("DEMO_PAYMENT_CURRENCY", env.PAYMENT_CURRENCY),
      paymentTokenDecimals: optionalEnv(
        "DEMO_PAYMENT_TOKEN_DECIMALS",
        env.PAYMENT_TOKEN_DECIMALS
      ),
      escrowContractAddress: optionalEnv(
        "DEMO_ESCROW_CONTRACT_ADDRESS",
        env.ESCROW_CONTRACT_ADDRESS
      ),
      gatewayPrivateKey: env.GATEWAY_PRIVATE_KEY,
      allowMockPayments: optionalEnv("DEMO_ALLOW_MOCK_PAYMENTS", env.ALLOW_MOCK_PAYMENTS)
    };
  }

  if (profileId === "live-testnet") {
    return {
      id: "live-testnet",
      dashboardLabel: "Live Testnet",
      network: optionalEnv("LIVE_TESTNET_KITE_NETWORK", "kite-testnet"),
      chainId: optionalEnv("LIVE_TESTNET_KITE_CHAIN_ID", "2368"),
      rpcUrl: optionalEnv("LIVE_TESTNET_KITE_RPC_URL", "https://rpc-testnet.gokite.ai"),
      explorerUrl: optionalEnv(
        "LIVE_TESTNET_KITE_EXPLORER_URL",
        "https://testnet.kitescan.ai"
      ),
      facilitatorBaseUrl: optionalEnv(
        "LIVE_TESTNET_PIEVERSE_FACILITATOR_BASE_URL",
        env.PIEVERSE_FACILITATOR_BASE_URL
      ),
      publicBaseUrl: env.GATEWAY_PUBLIC_BASE_URL,
      paymentAssetAddress: requireProfileEnv(
        "LIVE_TESTNET_PAYMENT_ASSET_ADDRESS",
        "live-testnet",
        process.env.SELLER_BOND_TOKEN_ADDRESS
      ),
      paymentCurrency: optionalEnv("LIVE_TESTNET_PAYMENT_CURRENCY", "USDC"),
      paymentTokenDecimals: optionalEnv("LIVE_TESTNET_PAYMENT_TOKEN_DECIMALS", "6"),
      escrowContractAddress: requireProfileEnv(
        "LIVE_TESTNET_ESCROW_CONTRACT_ADDRESS",
        "live-testnet"
      ),
      gatewayPrivateKey: env.GATEWAY_PRIVATE_KEY,
      allowMockPayments: optionalEnv(
        "LIVE_TESTNET_ALLOW_MOCK_PAYMENTS",
        env.ALLOW_MOCK_PAYMENTS
      )
    };
  }

  return {
    id: "live-mainnet",
    dashboardLabel: "Live Mainnet",
    network: optionalEnv("LIVE_MAINNET_KITE_NETWORK", "kite-mainnet"),
    chainId: optionalEnv("LIVE_MAINNET_KITE_CHAIN_ID", "2366"),
    rpcUrl: optionalEnv("LIVE_MAINNET_KITE_RPC_URL", "https://rpc.gokite.ai/"),
    explorerUrl: optionalEnv("LIVE_MAINNET_KITE_EXPLORER_URL", "https://kitescan.ai"),
    facilitatorBaseUrl: optionalEnv(
      "LIVE_MAINNET_PIEVERSE_FACILITATOR_BASE_URL",
      env.PIEVERSE_FACILITATOR_BASE_URL
    ),
    publicBaseUrl: env.GATEWAY_PUBLIC_BASE_URL,
    paymentAssetAddress: optionalEnv(
      "LIVE_MAINNET_PAYMENT_ASSET_ADDRESS",
      KITE_MAINNET_USDC_ADDRESS
    ),
    paymentCurrency: optionalEnv("LIVE_MAINNET_PAYMENT_CURRENCY", "USDC"),
    paymentTokenDecimals: optionalEnv("LIVE_MAINNET_PAYMENT_TOKEN_DECIMALS", "6"),
    escrowContractAddress: requireProfileEnv(
      "LIVE_MAINNET_ESCROW_CONTRACT_ADDRESS",
      "live-mainnet"
    ),
    gatewayPrivateKey: env.GATEWAY_PRIVATE_KEY,
    allowMockPayments: optionalEnv(
      "LIVE_MAINNET_ALLOW_MOCK_PAYMENTS",
      env.ALLOW_MOCK_PAYMENTS
    )
  };
}

export function getDashboardScope(input: {
  mode?: string | null;
  network?: string | null;
}): DashboardScope {
  if (input.mode !== "live") {
    return {
      mode: "demo",
      network: "demo",
      label: "Demo Testnet",
      currency: "USDT",
      networkProfiles: ["demo-testnet"]
    };
  }

  if (input.network === "mainnet") {
    return {
      mode: "live",
      network: "mainnet",
      label: "Live Mainnet",
      currency: "USDC",
      networkProfiles: ["live-mainnet"]
    };
  }

  return {
    mode: "live",
    network: "testnet",
    label: "Live Testnet",
    currency: "USDT/USDC",
    networkProfiles: ["demo-testnet", "live-testnet"]
  };
}

export function getDashboardScopeFromRequest(request: Request): DashboardScope {
  const url = new URL(request.url);

  return getDashboardScope({
    mode: url.searchParams.get("mode"),
    network: url.searchParams.get("network")
  });
}
