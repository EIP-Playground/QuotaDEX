export type SellerStatus = "offline" | "idle" | "reserved" | "busy";
export type JobStatus = "settling" | "paid" | "running" | "done" | "failed";

export type DashboardSummaryResponse = {
  metrics: {
    activeSellers: number;
    openJobs: number;
    completedJobs: number;
    failedJobs: number;
    volume24h: number;
  };
  activity24h: Array<{
    hour: string;
    createdJobs: number;
    settledJobs: number;
  }>;
  sellerStatus: Record<SellerStatus, number>;
  settlement: {
    primary: "Kite x402 Escrow";
    fallback: "Mock fallback only";
    future: "Profile-based Live Mainnet switch";
  };
  updatedAt: string | null;
};

export type DashboardMarketRow = {
  sellerId: string;
  capability: string;
  pricePerTask: string;
  status: SellerStatus;
  updatedAt: string;
  completedJobs24h: number;
  totalEarned24h: string;
  latestJobAt: string | null;
};

export type DashboardTopSellerRow = {
  sellerId: string;
  capability: string;
  status: SellerStatus;
  completedJobs24h: number;
  totalEarned24h: string;
  latestJobAt: string | null;
};

export type DashboardSettlementRow = {
  id: string;
  jobId: string;
  sellerId: string;
  capability: string;
  type: "released" | "refunded";
  amount: string;
  txHash: string;
  timestamp: string;
};

export type DashboardMarketResponse = {
  rows: DashboardMarketRow[];
  topSellers: DashboardTopSellerRow[];
  recentSettlements: DashboardSettlementRow[];
};

export type DashboardEventTone = "positive" | "neutral" | "warning" | "critical";

export type DashboardEventItem = {
  id: string;
  jobId: string | null;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  tone: DashboardEventTone;
};

export type DashboardEventsResponse = {
  items: DashboardEventItem[];
};
