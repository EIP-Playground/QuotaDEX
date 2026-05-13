export type SellerStatus = "offline" | "idle" | "reserved" | "busy";
export type JobStatus = "settling" | "paid" | "running" | "done" | "failed";

export type DashboardSummaryResponse = {
  metrics: {
    activeSellers: number;
    openJobs: number;
    completedJobs: number;
    failedJobs: number;
  };
  sellerStatus: Record<SellerStatus, number>;
  settlement: {
    primary: "Kite x402 Escrow";
    fallback: "Mock fallback only";
    future: "Mainnet env switch";
  };
  updatedAt: string | null;
};

export type DashboardMarketRow = {
  sellerId: string;
  capability: string;
  pricePerTask: string;
  status: SellerStatus;
  updatedAt: string;
};

export type DashboardMarketResponse = {
  rows: DashboardMarketRow[];
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
