import "@testing-library/jest-dom/vitest";

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
setDefaultEnv("KITE_RPC_URL", "https://rpc-testnet.gokite.ai");
setDefaultEnv("PIEVERSE_FACILITATOR_BASE_URL", "https://facilitator.pieverse.io");
setDefaultEnv("KITE_PAYMENT_ASSET_ADDRESS", "0x1111111111111111111111111111111111111111");
setDefaultEnv("GATEWAY_MERCHANT_WALLET", "0x2222222222222222222222222222222222222222");
setDefaultEnv("PYUSD_CONTRACT_ADDRESS", "0x3333333333333333333333333333333333333333");
setDefaultEnv("PYUSD_DECIMALS", "6");
setDefaultEnv("ESCROW_CONTRACT_ADDRESS", "0x4444444444444444444444444444444444444444");
setDefaultEnv(
  "GATEWAY_PRIVATE_KEY",
  "0x1111111111111111111111111111111111111111111111111111111111111111"
);
