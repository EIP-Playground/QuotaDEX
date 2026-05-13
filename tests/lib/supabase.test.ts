import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ client: "supabase" }))
}));

const TOUCHED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "GATEWAY_SALT",
  "KITE_PAYMENT_ASSET_ADDRESS",
  "ESCROW_CONTRACT_ADDRESS",
  "GATEWAY_PRIVATE_KEY"
];

describe("createServerSupabaseClient", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();

    for (const name of TOUCHED_ENV) {
      originalEnv[name] = process.env[name];
      delete process.env[name];
    }

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  });

  afterEach(() => {
    for (const name of TOUCHED_ENV) {
      if (originalEnv[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalEnv[name];
      }
    }
  });

  it("does not require unrelated gateway or payment environment variables", () => {
    expect(() => createServerSupabaseClient()).not.toThrow();
    expect(createClient).toHaveBeenCalledWith("https://supabase.test", "service", {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  });
});
