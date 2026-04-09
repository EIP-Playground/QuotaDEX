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
  capability: string;
  amount: string;
  currency: "PYUSD";
  created_at: string;
  expires_at: string;
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
  key: keyof QuoteRequestBody
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
