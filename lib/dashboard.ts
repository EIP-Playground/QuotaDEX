import { createServerSupabaseClient } from "@/lib/supabase";
import type {
  DashboardEventItem,
  DashboardEventsResponse,
  DashboardMarketResponse,
  DashboardSummaryResponse,
  JobStatus,
  SellerStatus
} from "@/lib/dashboard-types";

type SellerRow = {
  id: string;
  capability: string;
  price_per_task: string | number;
  status: SellerStatus;
  updated_at: string;
};

type JobRow = {
  status: JobStatus;
};

type EventRow = {
  id: string;
  job_id: string | null;
  type: string;
  message: string;
  timestamp: string;
};

const SUMMARY_SETTLEMENT: DashboardSummaryResponse["settlement"] = {
  primary: "Custom Escrow",
  fallback: "Mock",
  future: "Pieverse Facilitator"
};

const SELLER_STATUSES: SellerStatus[] = ["offline", "idle", "reserved", "busy"];

function normalizePrice(value: string | number): string {
  return typeof value === "number" ? value.toFixed(4) : value;
}

function compareTimestampsDesc(a: string, b: string) {
  return new Date(b).getTime() - new Date(a).getTime();
}

function eventTitleForType(type: string): string {
  switch (type) {
    case "DONE":
      return "Execution completed";
    case "FAILED":
      return "Execution failed";
    case "PAID":
      return "Payment verified";
    case "RUNNING":
      return "Execution started";
    case "MATCHING":
      return "Seller matched";
    case "SELLER_ONLINE":
      return "Seller online";
    case "SELLER_OFFLINE":
      return "Seller offline";
    case "RELEASED":
      return "Escrow released";
    case "REFUNDED":
      return "Refund completed";
    default:
      return "Market update";
  }
}

function eventToneForType(type: string): DashboardEventItem["tone"] {
  switch (type) {
    case "DONE":
    case "RELEASED":
    case "PAID":
      return "positive";
    case "FAILED":
    case "REFUND_FAILED":
    case "RELEASE_FAILED":
      return "critical";
    case "REFUNDED":
    case "REFUND_SKIPPED":
    case "RELEASE_SKIPPED":
      return "warning";
    default:
      return "neutral";
  }
}

export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  const supabase = createServerSupabaseClient();
  const [{ data: sellers, error: sellersError }, { data: jobs, error: jobsError }, {
    data: events,
    error: eventsError
  }] = await Promise.all([
    supabase.from("sellers").select("status"),
    supabase.from("jobs").select("status"),
    supabase.from("events").select("timestamp")
  ]);

  if (sellersError) {
    throw new Error(`Failed to load sellers summary: ${sellersError.message}`);
  }

  if (jobsError) {
    throw new Error(`Failed to load jobs summary: ${jobsError.message}`);
  }

  if (eventsError) {
    throw new Error(`Failed to load events summary: ${eventsError.message}`);
  }

  const sellerStatus = SELLER_STATUSES.reduce<Record<SellerStatus, number>>(
    (accumulator, status) => ({
      ...accumulator,
      [status]: 0
    }),
    {
      offline: 0,
      idle: 0,
      reserved: 0,
      busy: 0
    }
  );

  for (const seller of (sellers ?? []) as Pick<SellerRow, "status">[]) {
    sellerStatus[seller.status] += 1;
  }

  const openJobs = ((jobs ?? []) as JobRow[]).filter(
    (job) => job.status === "paid" || job.status === "running"
  ).length;
  const completedJobs = ((jobs ?? []) as JobRow[]).filter((job) => job.status === "done").length;
  const failedJobs = ((jobs ?? []) as JobRow[]).filter((job) => job.status === "failed").length;
  const latestTimestamp = ((events ?? []) as Pick<EventRow, "timestamp">[])
    .map((event) => event.timestamp)
    .sort(compareTimestampsDesc)[0] ?? null;

  return {
    metrics: {
      activeSellers: sellerStatus.idle + sellerStatus.reserved + sellerStatus.busy,
      openJobs,
      completedJobs,
      failedJobs
    },
    sellerStatus,
    settlement: SUMMARY_SETTLEMENT,
    updatedAt: latestTimestamp
  };
}

export async function getDashboardMarket(): Promise<DashboardMarketResponse> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sellers")
    .select("id, capability, price_per_task, status, updated_at");

  if (error) {
    throw new Error(`Failed to load dashboard market: ${error.message}`);
  }

  const rows = ((data ?? []) as SellerRow[])
    .sort((left, right) => compareTimestampsDesc(left.updated_at, right.updated_at))
    .slice(0, 12)
    .map((seller) => ({
      sellerId: seller.id,
      capability: seller.capability,
      pricePerTask: normalizePrice(seller.price_per_task),
      status: seller.status,
      updatedAt: seller.updated_at
    }));

  return { rows };
}

export async function getDashboardEvents(): Promise<DashboardEventsResponse> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, job_id, type, message, timestamp");

  if (error) {
    throw new Error(`Failed to load dashboard events: ${error.message}`);
  }

  const items = ((data ?? []) as EventRow[])
    .sort((left, right) => compareTimestampsDesc(left.timestamp, right.timestamp))
    .slice(0, 20)
    .map((event) => ({
      id: event.id,
      jobId: event.job_id,
      type: event.type,
      title: eventTitleForType(event.type),
      message: event.message,
      timestamp: event.timestamp,
      tone: eventToneForType(event.type)
    }));

  return { items };
}
