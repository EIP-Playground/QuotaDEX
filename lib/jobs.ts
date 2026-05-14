import { createRedisClient } from "@/lib/redis";
import { createServerSupabaseClient } from "@/lib/supabase";
import {
  parseNetworkProfileId,
  type NetworkProfileId
} from "@/lib/network-profiles";

export type QuoteRequestBody = {
  buyer_id: string;
  capability: string;
  prompt: string;
  network_profile?: NetworkProfileId;
  demo_run_id?: string;
  demo_payment_mode?: "demo-direct-escrow";
};

export type QuoteContext = {
  payment_id: string;
  fingerprint: string;
  buyer_id: string;
  seller_id: string;
  seller_reserved_at: string;
  capability: string;
  amount: string;
  amount_atomic: string;
  currency: string;
  payment_mode: PaymentMode;
  payment_asset: string;
  pay_to: string;
  network_profile: NetworkProfileId;
  network: string;
  chain_id: string;
  created_at: string;
  expires_at: string;
};

export type VerifyRequestBody = {
  fingerprint: string;
  tx_hash: string | null;
  payload: QuoteRequestBody;
};

export type StartJobBody = {
  seller_id: string;
  seller_signature?: string;
  seller_signed_at?: string;
};

export type CompleteJobBody = StartJobBody & {
  result: unknown;
};

export type FailJobBody = StartJobBody & {
  error: string;
};

type SellerCandidateRow = {
  id: string;
  capability: string;
  price_per_task: string | number;
  status: "idle" | "reserved";
  network_profile: NetworkProfileId;
  updated_at: string;
  last_heartbeat_at: string | null;
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

export type CreatedSettlingJob = {
  id: string;
  payment_id: string;
  status: "settling";
};

export type PaymentMode = "mock" | "x402-escrow";
export type PaymentStatus =
  | "created"
  | "settling"
  | "mock_verified"
  | "escrow_deposited"
  | "escrow_registered"
  | "released"
  | "refunded";

export type VerifiedPaymentMetadata = {
  mode: PaymentMode;
  settlementTxHash?: string | null;
  escrowRegistrationTxHash?: string | null;
  buyerWalletAddress?: string | null;
  sellerWalletAddress?: string | null;
  escrowContractAddress?: string | null;
};

export type JobSnapshot = {
  id: string;
  seller_id: string;
  status: "settling" | "paid" | "running" | "done" | "failed";
  payment_id: string;
  tx_hash: string | null;
  payment_mode: PaymentMode;
  escrow_contract_address: string | null;
  network_profile: NetworkProfileId;
  settlement_tx_hash: string | null;
  escrow_registration_tx_hash: string | null;
  payload: Record<string, unknown>;
  result: unknown;
};

export type UpdatedJobStatus = {
  id: string;
  status: "running" | "done" | "failed";
  seller_id: string;
  result: unknown;
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
export const SELLER_HEARTBEAT_TTL_SECONDS = 60;
export const QUOTE_CONTEXT_TTL_SECONDS = 300;
export const QUOTE_CONTEXT_KEY_PREFIX = "quote";
export const QUOTE_PAYMENT_MODE = "x402-escrow";

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

function readOptionalString(
  input: Record<string, unknown>,
  key: string
): string | undefined {
  const value = input[key];

  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function parsePaymentMode(value: string): PaymentMode {
  if (value === "mock" || value === "x402-escrow") {
    return value;
  }

  throw new Error(`Unsupported payment_mode: ${value}.`);
}

function normalizePrice(value: string | number): string {
  return typeof value === "number" ? value.toString() : value;
}

function getReservedSellerCutoff(now = new Date()): string {
  return new Date(
    now.getTime() - RESERVED_SELLER_TIMEOUT_SECONDS * 1000
  ).toISOString();
}

function getOnlineSellerCutoff(now = new Date()): string {
  return new Date(
    now.getTime() - SELLER_HEARTBEAT_TTL_SECONDS * 1000
  ).toISOString();
}

async function listIdleSellerCandidates(
  capability: string,
  networkProfile: NetworkProfileId
): Promise<SellerCandidateRow[]> {
  const supabase = createServerSupabaseClient();

  const { data: idleCandidates, error: idleError } = await supabase
    .from("sellers")
    .select("id, capability, price_per_task, status, network_profile, updated_at, last_heartbeat_at")
    .eq("capability", capability)
    .eq("network_profile", networkProfile)
    .eq("status", "idle")
    .gte("last_heartbeat_at", getOnlineSellerCutoff())
    .order("updated_at", { ascending: false })
    .limit(SELLER_CANDIDATE_BATCH_SIZE);

  if (idleError) {
    throw new Error(`Failed to load idle sellers: ${idleError.message}`);
  }

  return (idleCandidates ?? []) as SellerCandidateRow[];
}

async function listStaleReservedSellerCandidates(
  capability: string,
  networkProfile: NetworkProfileId
): Promise<SellerCandidateRow[]> {
  const supabase = createServerSupabaseClient();

  const { data: staleReservedCandidates, error: staleReservedError } =
    await supabase
      .from("sellers")
      .select("id, capability, price_per_task, status, network_profile, updated_at, last_heartbeat_at")
      .eq("capability", capability)
      .eq("network_profile", networkProfile)
      .eq("status", "reserved")
      .lte("updated_at", getReservedSellerCutoff())
      .gte("last_heartbeat_at", getOnlineSellerCutoff())
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
    .eq("network_profile", candidate.network_profile)
    .eq("status", candidate.status)
    .eq("updated_at", candidate.updated_at)
    .select("id, capability, price_per_task, network_profile, updated_at")
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
  input: Omit<QuoteContext, "created_at" | "expires_at">
): QuoteContext {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + QUOTE_CONTEXT_TTL_SECONDS * 1000);

  return {
    ...input,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString()
  };
}

export function parseQuoteRequestBody(input: unknown): QuoteRequestBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  const demoPaymentMode =
    input.demo_payment_mode === "demo-direct-escrow"
      ? "demo-direct-escrow"
      : undefined;
  const networkProfile = readOptionalString(input, "network_profile");

  return {
    buyer_id: readRequiredString(input, "buyer_id"),
    capability: readRequiredString(input, "capability"),
    prompt: readRequiredString(input, "prompt"),
    network_profile:
      networkProfile || demoPaymentMode
        ? parseNetworkProfileId(networkProfile, "demo-testnet")
        : undefined,
    demo_run_id: readOptionalString(input, "demo_run_id"),
    demo_payment_mode: demoPaymentMode
  };
}

export function parseVerifyRequestBody(input: unknown): VerifyRequestBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  const txHash = input.tx_hash;

  if (
    txHash !== undefined &&
    txHash !== null &&
    (typeof txHash !== "string" || txHash.trim() === "")
  ) {
    throw new Error("tx_hash must be a non-empty string when provided.");
  }

  return {
    fingerprint: readRequiredString(input, "fingerprint"),
    tx_hash: typeof txHash === "string" ? txHash.trim() : null,
    payload: parseQuoteRequestBody(input.payload)
  };
}

export function parseStartJobBody(input: unknown): StartJobBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  return {
    seller_id: readRequiredString(input, "seller_id"),
    seller_signature: readOptionalString(input, "seller_signature"),
    seller_signed_at: readOptionalString(input, "seller_signed_at")
  };
}

export function parseCompleteJobBody(input: unknown): CompleteJobBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (!Object.prototype.hasOwnProperty.call(input, "result")) {
    throw new Error("result is required.");
  }

  return {
    seller_id: readRequiredString(input, "seller_id"),
    seller_signature: readOptionalString(input, "seller_signature"),
    seller_signed_at: readOptionalString(input, "seller_signed_at"),
    result: input.result
  };
}

export function parseFailJobBody(input: unknown): FailJobBody {
  if (!isRecord(input)) {
    throw new Error("Request body must be a JSON object.");
  }

  return {
    seller_id: readRequiredString(input, "seller_id"),
    seller_signature: readOptionalString(input, "seller_signature"),
    seller_signed_at: readOptionalString(input, "seller_signed_at"),
    error: readRequiredString(input, "error")
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

  const network = readRequiredString(value, "network");
  const networkProfile = parseNetworkProfileId(
    readOptionalString(value, "network_profile"),
    "demo-testnet"
  );

  return {
    payment_id: readRequiredString(value, "payment_id"),
    fingerprint: readRequiredString(value, "fingerprint"),
    buyer_id: readRequiredString(value, "buyer_id"),
    seller_id: readRequiredString(value, "seller_id"),
    seller_reserved_at: readRequiredString(value, "seller_reserved_at"),
    capability: readRequiredString(value, "capability"),
    amount: readRequiredString(value, "amount"),
    amount_atomic: readRequiredString(value, "amount_atomic"),
    currency: readRequiredString(value, "currency"),
    payment_mode: parsePaymentMode(readRequiredString(value, "payment_mode")),
    payment_asset: readRequiredString(value, "payment_asset"),
    pay_to: readRequiredString(value, "pay_to"),
    network_profile: networkProfile,
    network,
    chain_id:
      readOptionalString(value, "chain_id") ??
      (networkProfile === "live-mainnet" ? "2366" : "2368"),
    created_at: readRequiredString(value, "created_at"),
    expires_at: readRequiredString(value, "expires_at")
  };
}

export async function reserveSellerForQuote(
  capability: string,
  networkProfile: NetworkProfileId
): Promise<ReservedSeller | null> {
  const candidateGroups = [
    await listIdleSellerCandidates(capability, networkProfile),
    await listStaleReservedSellerCandidates(capability, networkProfile)
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

export async function releaseReservedSeller(
  sellerId: string,
  networkProfile: NetworkProfileId
): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("sellers")
    .update({
      status: "idle",
      updated_at: new Date().toISOString()
    })
    .eq("id", sellerId)
    .eq("network_profile", networkProfile)
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

function paymentStatusForVerifiedPayment(payment: VerifiedPaymentMetadata): PaymentStatus {
  if (payment.mode === "x402-escrow") {
    return "escrow_registered";
  }

  return "mock_verified";
}

function buildJobPayload(verifyRequest: VerifyRequestBody) {
  const payload: {
    buyer_id: string;
    capability: string;
    prompt: string;
    network_profile?: NetworkProfileId;
    demo_run_id?: string;
    demo_payment_mode?: "demo-direct-escrow";
  } = {
    buyer_id: verifyRequest.payload.buyer_id,
    capability: verifyRequest.payload.capability,
    prompt: verifyRequest.payload.prompt,
    network_profile: verifyRequest.payload.network_profile
  };

  if (verifyRequest.payload.demo_run_id) {
    payload.demo_run_id = verifyRequest.payload.demo_run_id;
  }

  if (verifyRequest.payload.demo_payment_mode) {
    payload.demo_payment_mode = verifyRequest.payload.demo_payment_mode;
  }

  return payload;
}

export async function createSettlingJob(
  params: {
    verifyRequest: VerifyRequestBody;
    quoteContext: QuoteContext;
  }
): Promise<CreatedSettlingJob> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      payment_id: params.quoteContext.payment_id,
      buyer_id: params.quoteContext.buyer_id,
      seller_id: params.quoteContext.seller_id,
      tx_hash: null,
      payment_mode: params.quoteContext.payment_mode,
      payment_status: "settling",
      amount: params.quoteContext.amount,
      amount_atomic: params.quoteContext.amount_atomic,
      currency: params.quoteContext.currency,
      payment_asset: params.quoteContext.payment_asset,
      buyer_wallet_address: params.quoteContext.buyer_id,
      seller_wallet_address: params.quoteContext.seller_id,
      escrow_contract_address: params.quoteContext.pay_to,
      network_profile: params.quoteContext.network_profile,
      settlement_tx_hash: null,
      escrow_registration_tx_hash: null,
      expires_at: params.quoteContext.expires_at,
      payload: buildJobPayload(params.verifyRequest),
      status: "settling"
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

    throw new Error(`Failed to create settling job: ${error.message}`);
  }

  return data as CreatedSettlingJob;
}

export async function finalizeSettlingJobPayment(
  params: {
    jobId: string;
    verifyRequest: VerifyRequestBody;
    quoteContext: QuoteContext;
    txHash: string | null;
    payment: VerifiedPaymentMetadata;
  }
): Promise<CreatedPaidJob | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("jobs")
    .update({
      tx_hash: params.txHash,
      payment_mode: params.payment.mode,
      payment_status: paymentStatusForVerifiedPayment(params.payment),
      buyer_wallet_address:
        params.payment.buyerWalletAddress ?? params.quoteContext.buyer_id,
      seller_wallet_address:
        params.payment.sellerWalletAddress ?? params.quoteContext.seller_id,
      escrow_contract_address:
        params.payment.escrowContractAddress ?? params.quoteContext.pay_to,
      network_profile: params.quoteContext.network_profile,
      settlement_tx_hash: params.payment.settlementTxHash ?? null,
      escrow_registration_tx_hash: params.payment.escrowRegistrationTxHash ?? null,
      payload: buildJobPayload(params.verifyRequest),
      status: "paid"
    })
    .eq("id", params.jobId)
    .eq("payment_id", params.quoteContext.payment_id)
    .eq("status", "settling")
    .select("id, payment_id, status")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      const message = error.message.toLowerCase();
      const reason = message.includes("payment_id") ? "payment_id" : "tx_hash";
      throw new DuplicateVerificationError(
        "Payment verification was already processed.",
        reason
      );
    }

    throw new Error(`Failed to finalize settling job: ${error.message}`);
  }

  return (data as CreatedPaidJob | null) ?? null;
}

export async function createPaidJob(
  params: {
    verifyRequest: VerifyRequestBody;
    quoteContext: QuoteContext;
    txHash: string | null;
    payment?: VerifiedPaymentMetadata;
  }
): Promise<CreatedPaidJob> {
  const supabase = createServerSupabaseClient();
  const payment = params.payment;
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      payment_id: params.quoteContext.payment_id,
      buyer_id: params.quoteContext.buyer_id,
      seller_id: params.quoteContext.seller_id,
      tx_hash: params.txHash,
      payment_mode: payment?.mode ?? "mock",
      payment_status:
        payment !== undefined
          ? paymentStatusForVerifiedPayment(payment)
          : "mock_verified",
      amount: params.quoteContext.amount,
      amount_atomic: params.quoteContext.amount_atomic,
      currency: params.quoteContext.currency,
      payment_asset: params.quoteContext.payment_asset,
      buyer_wallet_address:
        payment?.buyerWalletAddress ?? params.quoteContext.buyer_id,
      seller_wallet_address:
        payment?.sellerWalletAddress ?? params.quoteContext.seller_id,
      escrow_contract_address:
        payment?.escrowContractAddress ?? params.quoteContext.pay_to,
      network_profile: params.quoteContext.network_profile,
      settlement_tx_hash: payment?.settlementTxHash ?? null,
      escrow_registration_tx_hash: payment?.escrowRegistrationTxHash ?? null,
      expires_at: params.quoteContext.expires_at,
      payload: buildJobPayload(params.verifyRequest),
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
    .eq("network_profile", quoteContext.network_profile)
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

export async function loadJobSnapshot(jobId: string): Promise<JobSnapshot | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, seller_id, status, payment_id, tx_hash, payment_mode, escrow_contract_address, network_profile, settlement_tx_hash, escrow_registration_tx_hash, payload, result"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load job ${jobId}: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as JobSnapshot & { network_profile?: NetworkProfileId | null };

  return {
    ...row,
    network_profile: row.network_profile ?? "demo-testnet"
  };
}

export async function updateJobStatusForSeller(params: {
  jobId: string;
  sellerId: string;
  expectedStatus: "paid" | "running";
  nextStatus: "running" | "done" | "failed";
  result?: unknown;
}): Promise<UpdatedJobStatus | null> {
  const supabase = createServerSupabaseClient();
  const updatePayload: {
    status: "running" | "done" | "failed";
    result?: unknown;
  } = {
    status: params.nextStatus
  };

  if (params.result !== undefined) {
    updatePayload.result = params.result;
  }

  const { data, error } = await supabase
    .from("jobs")
    .update(updatePayload)
    .eq("id", params.jobId)
    .eq("seller_id", params.sellerId)
    .eq("status", params.expectedStatus)
    .select("id, status, seller_id, result")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update job ${params.jobId}: ${error.message}`);
  }

  return (data as UpdatedJobStatus | null) ?? null;
}

export async function setSellerIdleAfterExecution(
  sellerId: string,
  networkProfile: NetworkProfileId
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sellers")
    .update({
      status: "idle",
      updated_at: new Date().toISOString()
    })
    .eq("id", sellerId)
    .eq("network_profile", networkProfile)
    .eq("status", "busy")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to release busy seller ${sellerId}: ${error.message}`);
  }

  return Boolean(data);
}

export async function recordJobPaymentTransition(params: {
  jobId: string;
  paymentStatus: "released" | "refunded";
  releaseTxHash?: string;
  refundTxHash?: string;
}): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      payment_status: params.paymentStatus,
      release_tx_hash: params.releaseTxHash ?? null,
      refund_tx_hash: params.refundTxHash ?? null
    })
    .eq("id", params.jobId);

  if (error) {
    throw new Error(
      `Failed to record payment transition for job ${params.jobId}: ${error.message}`
    );
  }
}

export async function logJobEvent(params: {
  jobId: string;
  type: string;
  message: string;
  networkProfile?: NetworkProfileId;
}): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("events").insert({
    job_id: params.jobId,
    network_profile: params.networkProfile,
    type: params.type,
    message: params.message
  });

  if (error) {
    throw new Error(`Failed to log job event ${params.type}: ${error.message}`);
  }
}
