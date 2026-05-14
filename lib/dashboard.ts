import { createServerSupabaseClient } from "@/lib/supabase";
import type {
  DashboardEventItem,
  DashboardEventsResponse,
  DashboardMarketResponse,
  DashboardSummaryResponse,
  DashboardTopSellerRow,
  JobStatus,
  SellerStatus
} from "@/lib/dashboard-types";
import type { DashboardScope } from "@/lib/network-profiles";
import { getDashboardScope } from "@/lib/network-profiles";

type SellerRow = {
  id: string;
  capability: string;
  price_per_task: string | number;
  status: SellerStatus;
  updated_at: string;
};

type JobRow = {
  id?: string;
  seller_id?: string;
  status: JobStatus;
  payment_status?: string | null;
  amount?: string | number | null;
  created_at?: string | null;
  release_tx_hash?: string | null;
  refund_tx_hash?: string | null;
  settlement_tx_hash?: string | null;
};

type EventRow = {
  id: string;
  job_id: string | null;
  type: string;
  message: string;
  timestamp: string;
};

const SUMMARY_SETTLEMENT: DashboardSummaryResponse["settlement"] = {
  primary: "Kite x402 Escrow",
  fallback: "Mock fallback only",
  future: "Profile-based Live Mainnet switch"
};

const SELLER_STATUSES: SellerStatus[] = ["offline", "idle", "reserved", "busy"];
const OPEN_JOB_STATUSES = new Set<JobStatus>(["settling", "paid", "running"]);
const SETTLEMENT_EVENT_TYPES = new Set(["RELEASED", "REFUNDED", "DEMO_DONE"]);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function normalizePrice(value: string | number): string {
  return typeof value === "number" ? value.toFixed(4) : value;
}

function parseAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatAmount(value: number): string {
  return Math.max(value, 0).toFixed(4);
}

function compareTimestampsDesc(a: string, b: string) {
  return new Date(b).getTime() - new Date(a).getTime();
}

function isWithinLast24Hours(timestamp: string | null | undefined) {
  if (!timestamp) {
    return false;
  }

  const time = new Date(timestamp).getTime();
  const now = Date.now();
  return Number.isFinite(time) && time <= now && now - time <= ONE_DAY_MS;
}

function isReleasedEarningJob(job: JobRow) {
  return job.status === "done" && job.payment_status === "released" && parseAmount(job.amount) > 0;
}

function isSettlementEvent(event: Pick<EventRow, "type" | "job_id">) {
  return Boolean(event.job_id && SETTLEMENT_EVENT_TYPES.has(event.type));
}

function buildSettlementTimestampByJob(events: Pick<EventRow, "job_id" | "type" | "timestamp">[]) {
  const timestampByJob = new Map<string, string>();

  for (const event of events) {
    if (!event.job_id || !isSettlementEvent(event)) {
      continue;
    }

    const current = timestampByJob.get(event.job_id);
    if (!current || compareTimestampsDesc(event.timestamp, current) < 0) {
      timestampByJob.set(event.job_id, event.timestamp);
    }
  }

  return timestampByJob;
}

function hourStart(timestamp: number) {
  const date = new Date(timestamp);
  date.setUTCMinutes(0, 0, 0);
  return date;
}

function buildActivity24h(
  jobRows: JobRow[],
  settlementTimestampByJob: Map<string, string>
): DashboardSummaryResponse["activity24h"] {
  const currentHour = hourStart(Date.now());
  const startHourTime = currentHour.getTime() - 23 * 60 * 60 * 1000;
  const buckets = Array.from({ length: 24 }, (_, index) => ({
    hour: new Date(startHourTime + index * 60 * 60 * 1000).toISOString(),
    createdJobs: 0,
    settledJobs: 0
  }));

  for (const job of jobRows) {
    if (!job.created_at) {
      continue;
    }

    const jobHour = hourStart(new Date(job.created_at).getTime()).getTime();
    const index = Math.floor((jobHour - startHourTime) / (60 * 60 * 1000));
    if (index < 0 || index >= buckets.length) {
      continue;
    }

    buckets[index].createdJobs += 1;
  }

  for (const settlementTimestamp of settlementTimestampByJob.values()) {
    const settlementHour = hourStart(new Date(settlementTimestamp).getTime()).getTime();
    const index = Math.floor((settlementHour - startHourTime) / (60 * 60 * 1000));
    if (index < 0 || index >= buckets.length) {
      continue;
    }

    buckets[index].settledJobs += 1;
  }

  return buckets;
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
    case "DEMO_DONE":
      return "Demo completed";
    case "SELLER_REGISTERED":
      return "Seller registered";
    case "SELLER_ONLINE":
      return "Seller online";
    case "SELLER_OFFLINE":
      return "Seller offline";
    case "RELEASED":
      return "Escrow released";
    case "RELEASE_SKIPPED":
      return "Release skipped";
    case "REFUNDED":
      return "Refund completed";
    default:
      return "Market update";
  }
}

function eventToneForType(type: string): DashboardEventItem["tone"] {
  switch (type) {
    case "DONE":
    case "DEMO_DONE":
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
  return getDashboardSummaryForScope(getDashboardScope({ mode: "demo" }));
}

export async function getDashboardSummaryForScope(
  scope: DashboardScope
): Promise<DashboardSummaryResponse> {
  const supabase = createServerSupabaseClient();
  const [{ data: sellers, error: sellersError }, { data: jobs, error: jobsError }, {
    data: events,
    error: eventsError
  }] = await Promise.all([
    supabase.from("sellers").select("status").in("network_profile", scope.networkProfiles),
    supabase
      .from("jobs")
      .select("id, status, payment_status, amount, created_at")
      .in("network_profile", scope.networkProfiles),
    supabase
      .from("events")
      .select("job_id, type, timestamp")
      .in("network_profile", scope.networkProfiles)
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

  const jobRows = (jobs ?? []) as JobRow[];
  const eventRows = (events ?? []) as Pick<EventRow, "job_id" | "type" | "timestamp">[];
  const settlementTimestampByJob = buildSettlementTimestampByJob(eventRows);
  const openJobs = jobRows.filter((job) => OPEN_JOB_STATUSES.has(job.status)).length;
  const completedJobs = jobRows.filter((job) => job.status === "done").length;
  const failedJobs = jobRows.filter((job) => job.status === "failed").length;
  const volume24h = jobRows
    .filter((job) => {
      const settlementTimestamp = job.id ? settlementTimestampByJob.get(job.id) : null;
      return isWithinLast24Hours(settlementTimestamp) && isReleasedEarningJob(job);
    })
    .reduce((total, job) => total + parseAmount(job.amount), 0);
  const activity24h = buildActivity24h(jobRows, settlementTimestampByJob);
  const latestTimestamp = eventRows
    .map((event) => event.timestamp)
    .sort(compareTimestampsDesc)[0] ?? null;

  return {
    metrics: {
      activeSellers: sellerStatus.idle + sellerStatus.reserved + sellerStatus.busy,
      openJobs,
      completedJobs,
      failedJobs,
      volume24h
    },
    activity24h,
    sellerStatus,
    settlement: SUMMARY_SETTLEMENT,
    updatedAt: latestTimestamp
  };
}

export async function getDashboardMarket(): Promise<DashboardMarketResponse> {
  return getDashboardMarketForScope(getDashboardScope({ mode: "demo" }));
}

export async function getDashboardMarketForScope(
  scope: DashboardScope
): Promise<DashboardMarketResponse> {
  const supabase = createServerSupabaseClient();
  const settlementSince = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const [{ data: sellers, error: sellersError }, {
    data: events,
    error: eventsError
  }] =
    await Promise.all([
      supabase
        .from("sellers")
        .select("id, capability, price_per_task, status, updated_at")
        .in("network_profile", scope.networkProfiles),
      supabase
        .from("events")
        .select("job_id, type, timestamp")
        .in("type", Array.from(SETTLEMENT_EVENT_TYPES))
        .in("network_profile", scope.networkProfiles)
        .gte("timestamp", settlementSince)
        .order("timestamp", { ascending: false })
        .limit(200)
    ]);

  if (sellersError) {
    throw new Error(`Failed to load dashboard market sellers: ${sellersError.message}`);
  }

  if (eventsError) {
    throw new Error(`Failed to load dashboard market events: ${eventsError.message}`);
  }

  const sellerRows = (sellers ?? []) as SellerRow[];
  const eventRows = (events ?? []) as Pick<EventRow, "job_id" | "type" | "timestamp">[];
  const settlementJobIds = Array.from(
    new Set(eventRows.flatMap((event) => (event.job_id ? [event.job_id] : [])))
  );
  const { data: jobs, error: jobsError } =
    settlementJobIds.length > 0
      ? await supabase
          .from("jobs")
          .select(
            "id, seller_id, status, payment_status, amount, created_at, release_tx_hash, refund_tx_hash, settlement_tx_hash"
          )
          .in("id", settlementJobIds)
          .in("network_profile", scope.networkProfiles)
      : { data: [], error: null };

  if (jobsError) {
    throw new Error(`Failed to load dashboard market jobs: ${jobsError.message}`);
  }

  const jobRows = (jobs ?? []) as JobRow[];
  const sellerById = new Map(sellerRows.map((seller) => [seller.id, seller]));
  const settlementTimestampByJob = buildSettlementTimestampByJob(eventRows);
  const aggregateBySeller = new Map<
    string,
    {
      completedJobs24h: number;
      totalEarned24h: number;
      latestJobAt: string | null;
    }
  >();

  for (const job of jobRows) {
    const settlementTimestamp = job.id ? settlementTimestampByJob.get(job.id) : null;
    if (!job.seller_id || !isWithinLast24Hours(settlementTimestamp) || !isReleasedEarningJob(job)) {
      continue;
    }

    const aggregate = aggregateBySeller.get(job.seller_id) ?? {
      completedJobs24h: 0,
      totalEarned24h: 0,
      latestJobAt: null
    };

    aggregate.completedJobs24h += 1;
    aggregate.totalEarned24h += parseAmount(job.amount);
    if (
      settlementTimestamp &&
      (!aggregate.latestJobAt || compareTimestampsDesc(settlementTimestamp, aggregate.latestJobAt) < 0)
    ) {
      aggregate.latestJobAt = settlementTimestamp;
    }
    aggregateBySeller.set(job.seller_id, aggregate);
  }

  const rows = sellerRows
    .sort((left, right) => compareTimestampsDesc(left.updated_at, right.updated_at))
    .slice(0, 12)
    .map((seller) => {
      const aggregate = aggregateBySeller.get(seller.id);

      return {
        sellerId: seller.id,
        capability: seller.capability,
        pricePerTask: normalizePrice(seller.price_per_task),
        status: seller.status,
        updatedAt: seller.updated_at,
        completedJobs24h: aggregate?.completedJobs24h ?? 0,
        totalEarned24h: formatAmount(aggregate?.totalEarned24h ?? 0),
        latestJobAt: aggregate?.latestJobAt ?? null
      };
    });

  const topSellers: DashboardTopSellerRow[] = Array.from(aggregateBySeller.entries())
    .map(([sellerId, aggregate]) => {
      const seller = sellerById.get(sellerId);

      return {
        sellerId,
        capability: seller?.capability ?? "unknown",
        status: seller?.status ?? "offline",
        completedJobs24h: aggregate.completedJobs24h,
        totalEarned24h: formatAmount(aggregate.totalEarned24h),
        latestJobAt: aggregate.latestJobAt
      };
    })
    .sort((left, right) => {
      const volumeDelta = Number.parseFloat(right.totalEarned24h) - Number.parseFloat(left.totalEarned24h);
      if (volumeDelta !== 0) {
        return volumeDelta;
      }

      return compareTimestampsDesc(left.latestJobAt ?? "", right.latestJobAt ?? "");
    })
    .slice(0, 5);

  const recentSettlements = jobRows
    .filter((job) => {
      const settlementTimestamp = job.id ? settlementTimestampByJob.get(job.id) : null;
      const isSettlement = job.payment_status === "released" || job.payment_status === "refunded";
      return Boolean(job.id && job.seller_id && isWithinLast24Hours(settlementTimestamp) && isSettlement);
    })
    .sort((left, right) =>
      compareTimestampsDesc(
        left.id ? settlementTimestampByJob.get(left.id) ?? "" : "",
        right.id ? settlementTimestampByJob.get(right.id) ?? "" : ""
      )
    )
    .slice(0, 5)
    .map((job) => {
      const type: "released" | "refunded" = job.payment_status === "refunded" ? "refunded" : "released";
      const seller = job.seller_id ? sellerById.get(job.seller_id) : undefined;

      return {
        id: job.id ?? "",
        jobId: job.id ?? "",
        sellerId: job.seller_id ?? "",
        capability: seller?.capability ?? "unknown",
        type,
        amount: formatAmount(parseAmount(job.amount)),
        txHash:
          type === "refunded"
            ? job.refund_tx_hash ?? job.settlement_tx_hash ?? ""
            : job.release_tx_hash ?? job.settlement_tx_hash ?? "",
        timestamp: job.id ? settlementTimestampByJob.get(job.id) ?? "" : ""
      };
    })
    .filter((settlement) => settlement.txHash);

  return { rows, topSellers, recentSettlements };
}

export async function getDashboardEvents(): Promise<DashboardEventsResponse> {
  return getDashboardEventsForScope(getDashboardScope({ mode: "demo" }));
}

export async function getDashboardEventsForScope(
  scope: DashboardScope
): Promise<DashboardEventsResponse> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, job_id, type, message, timestamp")
    .in("network_profile", scope.networkProfiles);

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
