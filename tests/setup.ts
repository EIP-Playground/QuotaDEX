import "@testing-library/jest-dom/vitest";

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
}

function setDefaultEnv(name: string, value: string) {
  if (!process.env[name]) {
    process.env[name] = value;
  }
}

setDefaultEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
setDefaultEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
setDefaultEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
setDefaultEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
setDefaultEnv("UPSTASH_REDIS_REST_TOKEN", "upstash-token");
setDefaultEnv("GATEWAY_SALT", "salt");
setDefaultEnv("KITE_NETWORK", "kite-testnet");
setDefaultEnv("KITE_CHAIN_ID", "2368");
setDefaultEnv("KITE_RPC_URL", "https://rpc-testnet.gokite.ai");
setDefaultEnv("KITE_EXPLORER_URL", "https://testnet.kitescan.ai");
setDefaultEnv("PIEVERSE_FACILITATOR_BASE_URL", "https://facilitator.pieverse.io");
setDefaultEnv("KITE_PAYMENT_ASSET_ADDRESS", "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63");
setDefaultEnv("PAYMENT_TOKEN_DECIMALS", "18");
setDefaultEnv("PAYMENT_CURRENCY", "USDT");
setDefaultEnv("ESCROW_CONTRACT_ADDRESS", "0x4444444444444444444444444444444444444444");
setDefaultEnv(
  "LIVE_MAINNET_ESCROW_CONTRACT_ADDRESS",
  "0x9999999999999999999999999999999999999999"
);
setDefaultEnv(
  "GATEWAY_PRIVATE_KEY",
  "0x1111111111111111111111111111111111111111111111111111111111111111"
);
setDefaultEnv("ALLOW_MOCK_PAYMENTS", "false");
