import { createRedisClient } from "@/lib/redis";
import { createServerSupabaseClient } from "@/lib/supabase";

export type QuoteRequestBody = {
  buyer_id: string;
  capability: string;
  prompt: string;
};

export type QuoteContext = {
  payment_id: string;
  fingerprint: string;
  buyer_id: string;
  seller_id: string;
  seller_reserved_at: string;
  capability: string;
  amount: string;
  currency: "PYUSD";
  created_at: string;
  expires_at: string;
};

export type VerifyRequestBody = {
  fingerprint: string;
  tx_hash: string;
  payload: QuoteRequestBody;
};

type SellerCandidateRow = {
  id: string;
  capability: string;
  price_per_task: string | number;
  status: "idle" | "reserved";
  updated_at: string;
};

export type ReservedSeller = {
  id: string;
  capability: string;
  price_per_task: string;
  reserved_at: string;
};

export type CreatedPaidJob = {
  id: string;
  payment_id: string;
  status: "paid";
};

export class DuplicateVerificationError extends Error {
  constructor(
    message: string,
    readonly reason: "payment_id" | "tx_hash"
  ) {
    super(message);
    this.name = "DuplicateVerificationError";
  }
}

const SELLER_CANDIDATE_BATCH_SIZE = 20;
export const RESERVED_SELLER_TIMEOUT_SECONDS = 30;
export const QUOTE_CONTEXT_TTL_SECONDS = 300;
export const QUOTE_CONTEXT_KEY_PREFIX = "quote";
export const QUOTE_CURRENCY = "PYUSD";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRequiredString(
  input: Record<string, unknown>,
  key: string
): string {
  const value = input[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizePrice(value: string | number): string {
  return typeof value === "number" ? value.toString() : value;
}

function getReservedSellerCutoff(now = new Date()): string {
  return new Date(
    now.getTime() - RESERVED_SELLER_TIMEOUT_SECONDS * 1000
  ).toISOString();
}

async function listIdleSellerCandidates(
  capability: string
): Promise<SellerCandidateRow[]> {
  const supabase = createServerSupabaseClient();

  const { data: idleCandidates, error: idleError } = await supabase
    .from("sellers")
    .select("id, capability, price_per_task, status, updated_at")
    .eq("capability", capability)
    .eq("status", "idle")
    .order("updated_at", { ascending: false })
    .limit(SELLER_CANDIDATE_BATCH_SIZE);

  if (idleError) {
    throw new Error(`Failed to load idle sellers: ${idleError.message}`);
  }

  return (idleCandidates ?? []) as SellerCandidateRow[];
}

async function listStaleReservedSellerCandidates(
  capability: string
): Promise<SellerCandidateRow[]> {
  const supabase = createServerSupabaseClient();

  const { data: staleReservedCandidates, error: staleReservedError } =
    await supabase
      .from("sellers")
      .select("id, capability, price_per_task, status, updated_at")
      .eq("capability", capability)
      .eq("status", "reserved")
      .lte("updated_at", getReservedSellerCutoff())
      .order("updated_at", { ascending: true })
      .limit(SELLER_CANDIDATE_BATCH_SIZE);

  if (staleReservedError) {
    throw new Error(
      `Failed to load reserved seller fallback: ${staleReservedError.message}`
    );
  }

  return (staleReservedCandidates ?? []) as SellerCandidateRow[];
}

async function tryReserveSellerCandidate(
  candidate: SellerCandidateRow
): Promise<ReservedSeller | null> {
  const supabase = createServerSupabaseClient();
  const reservedAt = new Date().toISOString();
  const { data: reservedSeller, error: reserveError } = await supabase
    .from("sellers")
    .update({
      status: "reserved",
      updated_at: reservedAt
    })
    .eq("id", candidate.id)
    .eq("status", candidate.status)
    .eq("updated_at", candidate.updated_at)
    .select("id, capability, price_per_task, updated_at")
    .maybeSingle();

  if (reserveError) {
    throw new Error(`Failed to reserve seller ${candidate.id}: ${reserveError.message}`);
  }

  if (!reservedSeller) {
    return null;
  }

  return {
    id: reservedSeller.id,
    capability: reservedSeller.capability,
    price_per_task: normalizePrice(reservedSeller.price_per_task),
    reserved_at: reservedSeller.updated_at
  };
}

export function buildQuoteContextKey(paymentId: string): string {
  return `${QUOTE_CONTEXT_KEY_PREFIX}:${paymentId}`;
}

export function buildQuoteContext(
  input: Omit<QuoteContext, "created_at" | "expires_at" | "currency">
): QuoteContext {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + QUOTE_CONTEXT_TTL_SECONDS * 1000);

  return {
    ...input,
    currency: QUOTE_CURRENCY,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString()
  };
}

export function parseQuoteRequestBody(input: unknown): QuoteRequestBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  return {
    buyer_id: readRequiredString(input, "buyer_id"),
    capability: readRequiredString(input, "capability"),
    prompt: readRequiredString(input, "prompt")
  };
}

export function parseVerifyRequestBody(input: unknown): VerifyRequestBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  return {
    fingerprint: readRequiredString(input, "fingerprint"),
    tx_hash: readRequiredString(input, "tx_hash"),
    payload: parseQuoteRequestBody(input.payload)
  };
}

export function parseQuoteContextValue(input: unknown): QuoteContext {
  const value =
    typeof input === "string"
      ? JSON.parse(input) as unknown
      : input;

  if (!isRecord(value)) {
    throw new Error("Quote context must be a JSON object.");
  }

  const currency = readRequiredString(value, "currency");

  if (currency !== QUOTE_CURRENCY) {
    throw new Error(`Quote context currency must be ${QUOTE_CURRENCY}.`);
  }

  return {
    payment_id: readRequiredString(value, "payment_id"),
    fingerprint: readRequiredString(value, "fingerprint"),
    buyer_id: readRequiredString(value, "buyer_id"),
    seller_id: readRequiredString(value, "seller_id"),
    seller_reserved_at: readRequiredString(value, "seller_reserved_at"),
    capability: readRequiredString(value, "capability"),
    amount: readRequiredString(value, "amount"),
    currency: QUOTE_CURRENCY,
    created_at: readRequiredString(value, "created_at"),
    expires_at: readRequiredString(value, "expires_at")
  };
}

export async function reserveSellerForQuote(
  capability: string
): Promise<ReservedSeller | null> {
  const candidateGroups = [
    await listIdleSellerCandidates(capability),
    await listStaleReservedSellerCandidates(capability)
  ];

  for (const candidates of candidateGroups) {
    for (const candidate of candidates) {
      const reservedSeller = await tryReserveSellerCandidate(candidate);

      if (reservedSeller) {
        return reservedSeller;
      }
    }
  }

  return null;
}

export async function releaseReservedSeller(sellerId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("sellers")
    .update({
      status: "idle",
      updated_at: new Date().toISOString()
    })
    .eq("id", sellerId)
    .eq("status", "reserved");

  if (error) {
    throw new Error(`Failed to release reserved seller ${sellerId}: ${error.message}`);
  }
}

export async function loadQuoteContext(
  paymentId: string
): Promise<QuoteContext | null> {
  const redis = createRedisClient();
  const rawContext = await redis.get<string>(buildQuoteContextKey(paymentId));

  if (rawContext === null) {
    return null;
  }

  return parseQuoteContextValue(rawContext);
}

export async function deleteQuoteContext(paymentId: string): Promise<void> {
  const redis = createRedisClient();
  await redis.del(buildQuoteContextKey(paymentId));
}

export function verifyMockTxHash(txHash: string): void {
  const normalized = txHash.trim();

  if (!/^0x[a-fA-F0-9]{6,}$/.test(normalized)) {
    throw new Error("tx_hash must look like a mock hex transaction hash, for example 0xabc123.");
  }
}

export async function createPaidJob(
  verifyRequest: VerifyRequestBody,
  quoteContext: QuoteContext
): Promise<CreatedPaidJob> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      payment_id: quoteContext.payment_id,
      buyer_id: quoteContext.buyer_id,
      seller_id: quoteContext.seller_id,
      tx_hash: verifyRequest.tx_hash,
      payload: {
        buyer_id: verifyRequest.payload.buyer_id,
        capability: verifyRequest.payload.capability,
        prompt: verifyRequest.payload.prompt
      },
      status: "paid"
    })
    .select("id, payment_id, status")
    .single();

  if (error) {
    if (error.code === "23505") {
      const message = error.message.toLowerCase();
      const reason = message.includes("payment_id") ? "payment_id" : "tx_hash";
      throw new DuplicateVerificationError(
        "Payment verification was already processed.",
        reason
      );
    }

    throw new Error(`Failed to create paid job: ${error.message}`);
  }

  return data as CreatedPaidJob;
}

export async function markSellerBusyForPayment(
  quoteContext: QuoteContext
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sellers")
    .update({
      status: "busy",
      updated_at: new Date().toISOString()
    })
    .eq("id", quoteContext.seller_id)
    .eq("status", "reserved")
    .eq("updated_at", quoteContext.seller_reserved_at)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark seller busy: ${error.message}`);
  }

  return Boolean(data);
}

export async function deleteJob(jobId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);

  if (error) {
    throw new Error(`Failed to delete job ${jobId}: ${error.message}`);
  }
}
