import { Redis } from "@upstash/redis";
import { getServerEnv } from "@/lib/env";

export function createRedisClient() {
  const env = getServerEnv();

  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN
  });
}
