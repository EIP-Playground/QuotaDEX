import { createHash } from "node:crypto";
import { getServerEnv } from "@/lib/env";

export type FingerprintInput = {
  buyerId: string;
  capability: string;
  prompt: string;
};

export function buildFingerprint(
  input: FingerprintInput,
  salt = getServerEnv().GATEWAY_SALT
): string {
  const canonical = [
    input.buyerId.trim(),
    input.capability.trim(),
    input.prompt.trim(),
    salt.trim()
  ].join(":");

  return createHash("sha256").update(canonical).digest("hex");
}
