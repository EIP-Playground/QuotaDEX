type PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
};

type ServerEnv = PublicEnv & {
  SUPABASE_SERVICE_ROLE_KEY: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  GATEWAY_SALT: string;
  KITE_RPC_URL: string;
  PYUSD_CONTRACT_ADDRESS: string;
  PYUSD_DECIMALS: string;
  ESCROW_CONTRACT_ADDRESS: string;
  GATEWAY_PRIVATE_KEY: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getPublicEnv(): PublicEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  };
}

export function getServerEnv(): ServerEnv {
  return {
    ...getPublicEnv(),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    UPSTASH_REDIS_REST_URL: requireEnv("UPSTASH_REDIS_REST_URL"),
    UPSTASH_REDIS_REST_TOKEN: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
    GATEWAY_SALT: requireEnv("GATEWAY_SALT"),
    KITE_RPC_URL: requireEnv("KITE_RPC_URL"),
    PYUSD_CONTRACT_ADDRESS: requireEnv("PYUSD_CONTRACT_ADDRESS"),
    PYUSD_DECIMALS: requireEnv("PYUSD_DECIMALS"),
    ESCROW_CONTRACT_ADDRESS: requireEnv("ESCROW_CONTRACT_ADDRESS"),
    GATEWAY_PRIVATE_KEY: requireEnv("GATEWAY_PRIVATE_KEY")
  };
}
