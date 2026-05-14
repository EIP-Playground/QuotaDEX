type PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
};

type ServerEnv = PublicEnv & {
  SUPABASE_SERVICE_ROLE_KEY: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  GATEWAY_SALT: string;
  KITE_NETWORK: string;
  KITE_CHAIN_ID: string;
  KITE_RPC_URL: string;
  KITE_EXPLORER_URL: string;
  PIEVERSE_FACILITATOR_BASE_URL: string;
  GATEWAY_PUBLIC_BASE_URL: string;
  KITE_PASSPORT_ISSUER: string;
  KITE_PASSPORT_JWKS_URL: string;
  KITE_PAYMENT_ASSET_ADDRESS: string;
  PAYMENT_TOKEN_DECIMALS: string;
  PAYMENT_CURRENCY: string;
  ESCROW_CONTRACT_ADDRESS: string;
  GATEWAY_PRIVATE_KEY: string;
  ALLOW_MOCK_PAYMENTS: string;
  ALLOW_DIRECT_ESCROW_PAYMENTS: string;
  ALLOW_SELLER_SIGNATURE_AUTH: string;
  SELLER_SESSION_TTL_SECONDS: string;
};

type SupabaseServerEnv = PublicEnv & {
  SUPABASE_SERVICE_ROLE_KEY: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];

  return value && value.trim() !== "" ? value : defaultValue;
}

export function getPublicEnv(): PublicEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
}

export function getSupabaseServerEnv(): SupabaseServerEnv {
  return {
    ...getPublicEnv(),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  };
}

export function getServerEnv(): ServerEnv {
  return {
    ...getPublicEnv(),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    UPSTASH_REDIS_REST_URL: requireEnv("UPSTASH_REDIS_REST_URL"),
    UPSTASH_REDIS_REST_TOKEN: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
    GATEWAY_SALT: requireEnv("GATEWAY_SALT"),
    KITE_NETWORK: optionalEnv("KITE_NETWORK", "kite-testnet"),
    KITE_CHAIN_ID: optionalEnv("KITE_CHAIN_ID", "2368"),
    KITE_RPC_URL: optionalEnv("KITE_RPC_URL", "https://rpc-testnet.gokite.ai"),
    KITE_EXPLORER_URL: optionalEnv("KITE_EXPLORER_URL", "https://testnet.kitescan.ai"),
    PIEVERSE_FACILITATOR_BASE_URL: optionalEnv(
      "PIEVERSE_FACILITATOR_BASE_URL",
      "https://facilitator.pieverse.io"
    ),
    GATEWAY_PUBLIC_BASE_URL: optionalEnv(
      "GATEWAY_PUBLIC_BASE_URL",
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"
    ),
    KITE_PASSPORT_ISSUER: optionalEnv(
      "KITE_PASSPORT_ISSUER",
      "https://passport.prod.gokite.ai"
    ),
    KITE_PASSPORT_JWKS_URL: optionalEnv(
      "KITE_PASSPORT_JWKS_URL",
      "https://passport.prod.gokite.ai/.well-known/jwks.json"
    ),
    KITE_PAYMENT_ASSET_ADDRESS: requireEnv("KITE_PAYMENT_ASSET_ADDRESS"),
    PAYMENT_TOKEN_DECIMALS: optionalEnv("PAYMENT_TOKEN_DECIMALS", "18"),
    PAYMENT_CURRENCY: optionalEnv("PAYMENT_CURRENCY", "USDT"),
    ESCROW_CONTRACT_ADDRESS: requireEnv("ESCROW_CONTRACT_ADDRESS"),
    GATEWAY_PRIVATE_KEY: requireEnv("GATEWAY_PRIVATE_KEY"),
    ALLOW_MOCK_PAYMENTS: optionalEnv("ALLOW_MOCK_PAYMENTS", "false"),
    ALLOW_DIRECT_ESCROW_PAYMENTS: optionalEnv(
      "ALLOW_DIRECT_ESCROW_PAYMENTS",
      "false"
    ),
    ALLOW_SELLER_SIGNATURE_AUTH: optionalEnv(
      "ALLOW_SELLER_SIGNATURE_AUTH",
      "false"
    ),
    SELLER_SESSION_TTL_SECONDS: optionalEnv("SELLER_SESSION_TTL_SECONDS", "900")
  };
}
