"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  DashboardEventItem,
  DashboardEventsResponse,
  DashboardMarketResponse,
  DashboardMarketRow,
  DashboardSummaryResponse
} from "@/lib/dashboard-types";
import {
  FiActivity,
  FiAlertCircle,
  FiArrowLeft,
  FiArrowRight,
  FiBarChart2,
  FiCheckCircle,
  FiClock,
  FiCode,
  FiCpu,
  FiDollarSign,
  FiLayers,
  FiRadio,
  FiRefreshCw,
  FiSend,
  FiShield,
  FiZap
} from "react-icons/fi";
import { SiteHeader } from "@/components/site-header";

type Mode = "demo" | "real";
type PaymentRoute = "mock" | "escrow";
type ActionStepState = "pending" | "active" | "done" | "failed";
type ChartPoint = {
  label: string;
  supply: number;
  demand: number;
};
type QuoteResponse = {
  error: string;
  code: string;
  payment_id: string;
  fingerprint: string;
  pay_to: string;
  amount: string;
  currency: string;
  seller_id: string;
  expires_in_seconds: number;
};
type VerifyResponse = {
  job_id: string;
  status: string;
};
type JobResponse = {
  job_id: string;
  payment_id: string;
  seller_id: string;
  status: string;
  result?: {
    text?: string;
    meta?: {
      job_id?: string;
      completed_at?: string;
    };
    error?: string;
  } | null;
};
type ActionStep = {
  key: string;
  label: string;
  state: ActionStepState;
  detail: string;
};
type PendingOrder = {
  buyerId: string;
  capability: string;
  prompt: string;
};

const POLL_INTERVAL_MS = 1_000;
const RESULT_TIMEOUT_MS = 30_000;
const DEMO_PULSE_MS = 2_800;
const CHART_LABELS = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22", "24"];
const DEMO_MARKET_BASE: DashboardMarketRow[] = [
  {
    sellerId: "0xAb_4e",
    capability: "Llama-3 8B",
    pricePerTask: "0.001",
    status: "idle",
    updatedAt: "2026-04-19T08:00:00.000Z"
  },
  {
    sellerId: "0x8d_f2",
    capability: "Mistral 8x7B",
    pricePerTask: "0.003",
    status: "busy",
    updatedAt: "2026-04-19T08:01:00.000Z"
  },
  {
    sellerId: "0x3c_99",
    capability: "GPT-4 Turbo Proxy",
    pricePerTask: "0.005",
    status: "reserved",
    updatedAt: "2026-04-19T08:02:00.000Z"
  },
  {
    sellerId: "0x7a_1d",
    capability: "Mixtral 8x7B",
    pricePerTask: "0.002",
    status: "idle",
    updatedAt: "2026-04-19T08:03:00.000Z"
  },
  {
    sellerId: "0x45_c0",
    capability: "Claude-style Router",
    pricePerTask: "0.004",
    status: "busy",
    updatedAt: "2026-04-19T08:04:00.000Z"
  }
];
const DEMO_EVENTS_BASE: DashboardEventItem[] = [
  {
    id: "evt-demo-1",
    jobId: "job-demo-1",
    type: "DONE",
    title: "Execution completed",
    message: "Agent_X settled a routed Llama-3 request via Custom Escrow.",
    tone: "positive",
    timestamp: "2026-04-19T08:05:12.000Z"
  },
  {
    id: "evt-demo-2",
    jobId: "job-demo-2",
    type: "MATCHING",
    title: "Seller reserved",
    message: "Gateway reserved 0x8d_f2 for a Mixtral 8x7B run.",
    tone: "neutral",
    timestamp: "2026-04-19T08:04:40.000Z"
  },
  {
    id: "evt-demo-3",
    jobId: null,
    type: "PAID",
    title: "Mock fallback used",
    message: "A buyer verified through the stable mock path while escrow remained primary.",
    tone: "warning",
    timestamp: "2026-04-19T08:03:16.000Z"
  },
  {
    id: "evt-demo-4",
    jobId: null,
    type: "SELLER_ONLINE",
    title: "Seller online",
    message: "A new Mistral seller came online with realtime heartbeat active.",
    tone: "neutral",
    timestamp: "2026-04-19T08:02:03.000Z"
  }
];
const DEMO_CHART_BASE = [
  { supply: 48, demand: 22 },
  { supply: 34, demand: 29 },
  { supply: 31, demand: 43 },
  { supply: 39, demand: 67 },
  { supply: 55, demand: 74 },
  { supply: 76, demand: 45 },
  { supply: 58, demand: 51 },
  { supply: 47, demand: 49 },
  { supply: 52, demand: 28 },
  { supply: 104, demand: 38 },
  { supply: 66, demand: 52 },
  { supply: 71, demand: 88 },
  { supply: 99, demand: 44 }
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function buildMockTxHash() {
  const hex = Date.now().toString(16).padStart(8, "0");
  return `0x${hex}abc123`;
}

function buildRunBuyerId(buyerId: string) {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${buyerId.trim()}--run-${runId}`;
}

function buildActionSteps(): ActionStep[] {
  return [
    { key: "quote", label: "Quote requested", state: "pending", detail: "Waiting for input." },
    { key: "verify", label: "Payment verified", state: "pending", detail: "No payment submitted yet." },
    { key: "running", label: "Seller execution", state: "pending", detail: "No seller assigned yet." },
    { key: "result", label: "Result delivered", state: "pending", detail: "Nothing returned yet." }
  ];
}

function setStep(
  steps: ActionStep[],
  key: string,
  state: ActionStepState,
  detail: string
) {
  return steps.map((step) => (step.key === key ? { ...step, state, detail } : step));
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPrice(price: string) {
  return `${price} KITE`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(value));
}

function buildDemoSummary(frame: number): DashboardSummaryResponse {
  const activeSellers = 1245 + (frame % 5) * 7;
  const openJobs = 84 + (frame % 4) * 5;
  const completedJobs = 1_500_000 + frame * 184;
  const failedJobs = 18 + (frame % 3);

  return {
    metrics: {
      activeSellers,
      openJobs,
      completedJobs,
      failedJobs
    },
    sellerStatus: {
      idle: 612 + (frame % 3) * 4,
      reserved: 118 + (frame % 2) * 6,
      busy: 515 + (frame % 4) * 3,
      offline: 64
    },
    settlement: {
      primary: "Custom Escrow",
      fallback: "Mock",
      future: "Pieverse Facilitator"
    },
    updatedAt: new Date(Date.UTC(2026, 3, 19, 8, frame * 3, 0)).toISOString()
  };
}

function buildDemoMarket(frame: number): DashboardMarketRow[] {
  const rotation = frame % 4;
  const statuses = ["idle", "busy", "reserved", "idle"] as const;

  return DEMO_MARKET_BASE.map((row, index) => ({
    ...row,
    pricePerTask: (Number.parseFloat(row.pricePerTask) + ((frame + index) % 3) * 0.001)
      .toFixed(3),
    status: statuses[(index + rotation) % statuses.length],
    updatedAt: new Date(Date.UTC(2026, 3, 19, 8, frame + index, 0)).toISOString()
  }));
}

function buildDemoEvents(frame: number): DashboardEventItem[] {
  const generatedEvent: DashboardEventItem = {
    id: `evt-demo-live-${frame}`,
    jobId: frame % 2 === 0 ? `job-demo-live-${frame}` : null,
    type: frame % 2 === 0 ? "DONE" : "SELLER_ONLINE",
    title: frame % 2 === 0 ? "Synthetic order fill" : "Realtime heartbeat",
    message:
      frame % 2 === 0
        ? "Demo mode matched a buyer request to an idle seller and advanced the receipt feed."
        : "Demo mode refreshed the seller heartbeat stream and updated status rotation.",
    tone: frame % 2 === 0 ? "positive" : "neutral",
    timestamp: new Date(Date.UTC(2026, 3, 19, 8, 6 + frame, 12)).toISOString()
  };

  return [generatedEvent, ...DEMO_EVENTS_BASE].slice(0, 8);
}

function buildDemoChart(frame: number): ChartPoint[] {
  return DEMO_CHART_BASE.map((point, index) => ({
    label: CHART_LABELS[index],
    supply: point.supply + ((frame + index) % 3) * 4,
    demand: point.demand + ((frame + index * 2) % 4) * 5
  }));
}

async function gatewayJsonRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    payload = JSON.parse(text);
  }

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string" ? payload.error : `Request failed for ${path}.`
    );
  }

  return payload as T;
}

async function requestQuote(order: PendingOrder) {
  const response = await gatewayJsonRequest("/api/v1/jobs/quote", {
    method: "POST",
    body: JSON.stringify({
      buyer_id: order.buyerId,
      capability: order.capability,
      prompt: order.prompt
    })
  });

  if (response.status !== 402 || !response.payload) {
    throw new Error(`Expected HTTP 402 from quote, received ${response.status}.`);
  }

  return response.payload as QuoteResponse;
}

async function verifyPayment(params: {
  order: PendingOrder;
  quote: QuoteResponse;
  txHash: string;
}) {
  const response = await gatewayJsonRequest("/api/v1/jobs/verify", {
    method: "POST",
    body: JSON.stringify({
      fingerprint: params.quote.fingerprint,
      tx_hash: params.txHash,
      payload: {
        buyer_id: params.order.buyerId,
        capability: params.order.capability,
        prompt: params.order.prompt
      }
    })
  });

  if (!response.ok || !response.payload) {
    const payload = response.payload as { error?: string } | null;
    throw new Error(payload?.error ?? `Verify failed with status ${response.status}.`);
  }

  return response.payload as VerifyResponse;
}

async function fetchJob(jobId: string) {
  const response = await gatewayJsonRequest(`/api/v1/jobs/${jobId}`, {
    method: "GET"
  });

  if (!response.ok || !response.payload) {
    const payload = response.payload as { error?: string } | null;
    throw new Error(payload?.error ?? `Failed to fetch job ${jobId}.`);
  }

  return response.payload as JobResponse;
}

async function waitForJobResult(
  jobId: string,
  onProgress: (job: JobResponse) => void
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < RESULT_TIMEOUT_MS) {
    const job = await fetchJob(jobId);
    onProgress(job);

    if (job.status === "done") {
      return job;
    }

    if (job.status === "failed") {
      throw new Error(job.result?.error ?? `Job ${jobId} failed.`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for job ${jobId}.`);
}

function buildChartPath(
  points: ChartPoint[],
  accessor: (point: ChartPoint) => number,
  width: number,
  height: number
) {
  const max = Math.max(...points.map((point) => accessor(point)), 1);

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - (accessor(point) / max) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildChartArea(
  points: ChartPoint[],
  accessor: (point: ChartPoint) => number,
  width: number,
  height: number
) {
  const line = buildChartPath(points, accessor, width, height);
  return `${line} L ${width} ${height} L 0 ${height} Z`;
}

function renderStatus(status: string) {
  return (
    <span className={classNames("statusPill", `statusPill${status}`)}>
      <span className="statusDot" />
      {status}
    </span>
  );
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="monitorCard metricCard">
      <div className="metricIcon">{props.icon}</div>
      <div>
        <p className="monitorLabel">{props.label}</p>
        <strong className="metricValue">{props.value}</strong>
        <p className="monitorSubtle">{props.note}</p>
      </div>
    </article>
  );
}

function Timeline(props: { steps: ActionStep[] }) {
  return (
    <div className="timelineList">
      {props.steps.map((step) => (
        <div className={classNames("timelineRow", `timelineRow${step.state}`)} key={step.key}>
          <div className="timelineDot" />
          <div>
            <strong>{step.label}</strong>
            <p className="monitorSubtle">{step.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DemandChart(props: { points: ChartPoint[] }) {
  const width = 720;
  const height = 240;

  return (
    <div className="chartShell">
      <svg
        aria-label="Network demand versus supply chart"
        className="chartSvg"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="supplyGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(197, 145, 52, 0.45)" />
            <stop offset="100%" stopColor="rgba(197, 145, 52, 0.02)" />
          </linearGradient>
          <linearGradient id="demandGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(119, 105, 82, 0.34)" />
            <stop offset="100%" stopColor="rgba(119, 105, 82, 0.02)" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((line) => (
          <line
            className="chartGridLine"
            key={line}
            x1="0"
            x2={width}
            y1={(height / 4) * line}
            y2={(height / 4) * line}
          />
        ))}

        <path className="chartAreaDemand" d={buildChartArea(props.points, (point) => point.demand, width, height)} />
        <path className="chartAreaSupply" d={buildChartArea(props.points, (point) => point.supply, width, height)} />
        <path className="chartLineDemand" d={buildChartPath(props.points, (point) => point.demand, width, height)} />
        <path className="chartLineSupply" d={buildChartPath(props.points, (point) => point.supply, width, height)} />
      </svg>

      <div className="chartAxis">
        {props.points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}

export function DashboardClient() {
  const [mode, setMode] = useState<Mode>("demo");
  const [demoFrame, setDemoFrame] = useState(0);
  const [liveSummary, setLiveSummary] = useState<DashboardSummaryResponse | null>(null);
  const [liveMarket, setLiveMarket] = useState<DashboardMarketResponse | null>(null);
  const [liveEvents, setLiveEvents] = useState<DashboardEventsResponse | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [buyerId, setBuyerId] = useState("buyer-dashboard");
  const [capability, setCapability] = useState("llama-3 8b");
  const [prompt, setPrompt] = useState("Summarize the latest order flow and highlight capacity gaps.");
  const [paymentRoute, setPaymentRoute] = useState<PaymentRoute>("mock");
  const [txHashInput, setTxHashInput] = useState("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [resultText, setResultText] = useState("Result will appear here once a run completes.");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [steps, setSteps] = useState<ActionStep[]>(buildActionSteps);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const demoRunRef = useRef(0);

  useEffect(() => {
    if (mode !== "demo") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setDemoFrame((current) => current + 1);
    }, DEMO_PULSE_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "real") {
      return undefined;
    }

    let cancelled = false;

    async function loadLiveData() {
      setLiveLoading(true);
      setLiveError(null);

      try {
        const [summary, market, events] = await Promise.all([
          fetchJson<DashboardSummaryResponse>("/api/v1/dashboard/summary"),
          fetchJson<DashboardMarketResponse>("/api/v1/dashboard/market"),
          fetchJson<DashboardEventsResponse>("/api/v1/dashboard/events")
        ]);

        if (cancelled) {
          return;
        }

        setLiveSummary(summary);
        setLiveMarket(market);
        setLiveEvents(events);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLiveError(error instanceof Error ? error.message : "Failed to load live dashboard data.");
        setLiveSummary(null);
        setLiveMarket(null);
        setLiveEvents(null);
      } finally {
        if (!cancelled) {
          setLiveLoading(false);
        }
      }
    }

    void loadLiveData();
    const intervalId = window.setInterval(() => {
      void loadLiveData();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [mode]);

  const demoSummary = useMemo(() => buildDemoSummary(demoFrame), [demoFrame]);
  const demoMarket = useMemo(
    () => ({
      rows: buildDemoMarket(demoFrame)
    }),
    [demoFrame]
  );
  const demoEvents = useMemo(
    () => ({
      items: buildDemoEvents(demoFrame)
    }),
    [demoFrame]
  );
  const demoChart = useMemo(() => buildDemoChart(demoFrame), [demoFrame]);

  const summary = mode === "demo" ? demoSummary : liveSummary;
  const market = mode === "demo" ? demoMarket : liveMarket;
  const events = mode === "demo" ? demoEvents : liveEvents;

  async function handleStartDemoFlow() {
    const runId = ++demoRunRef.current;

    setActionBusy(true);
    setActionError(null);
    setQuote(null);
    setVerify(null);
    setJob(null);
    setPendingOrder(null);
    setResultText("Booting a synthetic marketplace run...");
    setSteps(buildActionSteps());
    setSteps((current) =>
      setStep(current, "quote", "active", "Building a synthetic 402 quote response.")
    );

    const wait = async (ms: number) => {
      await new Promise((resolve) => setTimeout(resolve, ms));

      if (runId !== demoRunRef.current) {
        throw new Error("RUN_SUPERSEDED");
      }
    };

    try {
      await wait(800);
      setSteps((current) =>
        setStep(current, "quote", "done", "Demo mode returned a synthetic 402 with quote context.")
      );
      setSteps((current) =>
        setStep(current, "verify", "active", "Advancing through the mock fallback verification path.")
      );

      await wait(900);
      setSteps((current) =>
        setStep(current, "verify", "done", "Mock fallback verified and opened a synthetic job.")
      );
      setSteps((current) =>
        setStep(current, "running", "active", "Synthetic seller accepted the task and started execution.")
      );

      await wait(1_100);
      setSteps((current) =>
        setStep(current, "running", "done", "Demo seller completed the routed execution loop.")
      );
      setSteps((current) =>
        setStep(current, "result", "active", "Shaping a synthetic receipt and final response.")
      );

      await wait(1_000);
      setSteps((current) =>
        setStep(current, "result", "done", "Synthetic execution complete.")
      );
      setResultText(
        "Synthetic execution complete. Demo mode generated a mock receipt, a routed seller result, and a refreshed activity feed without touching the Gateway."
      );
    } catch (error) {
      if (error instanceof Error && error.message === "RUN_SUPERSEDED") {
        return;
      }

      const message =
        error instanceof Error ? error.message : "Demo mode failed unexpectedly.";

      setActionError(message);
      setSteps((current) =>
        current.map((step) =>
          step.state === "active" ? { ...step, state: "failed", detail: message } : step
        )
      );
    } finally {
      if (runId === demoRunRef.current) {
        setActionBusy(false);
      }
    }
  }

  async function handleRequestQuote() {
    const runtimeOrder = {
      buyerId: buildRunBuyerId(buyerId),
      capability: capability.trim(),
      prompt: prompt.trim()
    };

    setActionBusy(true);
    setActionError(null);
    setQuote(null);
    setVerify(null);
    setJob(null);
    setTxHashInput("");
    setResultText("Live result will appear here once the Gateway run finishes.");
    setPendingOrder(runtimeOrder);
    setSteps(buildActionSteps());
    setSteps((current) =>
      setStep(current, "quote", "active", "Requesting a fresh quote from /api/v1/jobs/quote.")
    );

    try {
      const nextQuote = await requestQuote(runtimeOrder);
      setQuote(nextQuote);
      setSteps((current) =>
        setStep(
          current,
          "quote",
          "done",
          `Gateway returned HTTP 402 for ${nextQuote.amount} ${nextQuote.currency}.`
        )
      );
      setSteps((current) =>
        setStep(
          current,
          "verify",
          "active",
          paymentRoute === "mock"
            ? "Ready to verify through the stable mock fallback."
            : "Waiting for a real escrow deposit tx hash."
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to request quote.";
      setActionError(message);
      setSteps((current) => setStep(current, "quote", "failed", message));
      setPendingOrder(null);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleVerify(txHash: string) {
    if (!quote || !pendingOrder) {
      return;
    }

    setActionBusy(true);
    setActionError(null);
    setVerify(null);
    setJob(null);
    setSteps((current) =>
      setStep(
        current,
        "verify",
        "active",
        paymentRoute === "mock"
          ? "Submitting mock fallback verification to /api/v1/jobs/verify."
          : "Submitting escrow verification to /api/v1/jobs/verify."
      )
    );

    try {
      const verifyResponse = await verifyPayment({
        order: pendingOrder,
        quote,
        txHash
      });

      setVerify(verifyResponse);
      setSteps((current) =>
        setStep(current, "verify", "done", `Job ${verifyResponse.job_id} created after verify.`)
      );
      setSteps((current) =>
        setStep(current, "running", "active", "Polling the live job until it settles.")
      );

      const finalJob = await waitForJobResult(verifyResponse.job_id, (snapshot) => {
        setJob(snapshot);

        if (snapshot.status === "paid") {
          setSteps((current) =>
            setStep(current, "running", "active", "Payment is captured and seller assignment is locked.")
          );
        }

        if (snapshot.status === "running") {
          setSteps((current) =>
            setStep(current, "running", "active", "Seller is executing the request.")
          );
          setSteps((current) =>
            setStep(current, "result", "active", "Waiting for the Gateway to deliver the final payload.")
          );
        }
      });

      setJob(finalJob);
      setSteps((current) =>
        setStep(current, "running", "done", "Seller execution finished successfully.")
      );
      setSteps((current) =>
        setStep(current, "result", "done", "Gateway delivered the final result payload.")
      );
      setResultText(
        finalJob.result?.text ?? "Gateway finished the job, but no result text was returned."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verify failed.";
      setActionError(message);
      setSteps((current) =>
        current.map((step) =>
          step.state === "active" ? { ...step, state: "failed", detail: message } : step
        )
      );
    } finally {
      setActionBusy(false);
    }
  }

  const metricCards = [
    {
      label: "Active Sellers",
      value: summary ? formatMetric(summary.metrics.activeSellers) : "0",
      note:
        mode === "demo"
          ? "Synthetic capacity pulse across the network."
          : summary
            ? summary.updatedAt
              ? `Updated ${formatDateTime(summary.updatedAt)} UTC`
              : "Awaiting the first live event timestamp."
            : "Waiting for live Gateway counts.",
      icon: <FiCpu />
    },
    {
      label: "Open Jobs",
      value: summary ? formatMetric(summary.metrics.openJobs) : "0",
      note: "Jobs that are paid or running right now.",
      icon: <FiActivity />
    },
    {
      label: "Completed Jobs",
      value: summary ? formatMetric(summary.metrics.completedJobs) : "0",
      note: "Successful receipts closed through the Gateway.",
      icon: <FiCheckCircle />
    },
    {
      label: "Failed Jobs",
      value: summary ? formatMetric(summary.metrics.failedJobs) : "0",
      note: "Failures visible to operators and buyers.",
      icon: <FiAlertCircle />
    }
  ];

  return (
    <main className="dashboardShell">
      <div className="dashboardBackdrop" aria-hidden="true">
        <div className="dashboardAura dashboardAuraLeft" />
        <div className="dashboardAura dashboardAuraRight" />
        <div className="dashboardGridField" />
      </div>

      <SiteHeader current="dashboard" />

      <section className="dashboardHero">
        <div className="dashboardHeroMeta">
          <p className="eyebrow">QuotaDEX [Monitor]</p>
          <h1>Global Compute Monitor</h1>
          <p className="dashboardLead">
            A monitored surface for live market state, settlement direction and execution flow.
            Custom Escrow stays primary, Mock remains the stable fallback, and unsupported live data
            stays visibly marked instead of being faked.
          </p>

          <div className="dashboardHeroSignals">
            <span className="dashboardHeroSignal">Escrow-led settlement</span>
            <span className="dashboardHeroSignal">Realtime market feed</span>
            <span className="dashboardHeroSignal">AgentBazaar-compatible shape</span>
          </div>

          <Link className="textLink dashboardBackLink" href="/">
            <FiArrowLeft />
            Return to overview
          </Link>
        </div>

        <div className="modeToggle" role="tablist" aria-label="Dashboard mode switch">
          <button
            aria-pressed={mode === "demo"}
            className={classNames("modeButton", mode === "demo" && "modeButtonActive")}
            onClick={() => setMode("demo")}
            type="button"
          >
            Demo Mode
          </button>
          <button
            aria-pressed={mode === "real"}
            className={classNames("modeButton", mode === "real" && "modeButtonActive")}
            onClick={() => setMode("real")}
            type="button"
          >
            Real Mode
          </button>
        </div>
      </section>

      <div className="coverageNotice">
        <FiBarChart2 />
        <span>No live source yet for historical demand and supply analytics in Real Mode.</span>
      </div>

      {mode === "real" && liveError ? (
        <div className="warningBanner">
          <FiAlertCircle />
          <span>{liveError}</span>
        </div>
      ) : null}

      <section className="metricGrid">
        {metricCards.map((metric) => (
          <MetricCard
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            note={metric.note}
            value={metric.value}
          />
        ))}
      </section>

      <section className="dashboardGridTop">
        <article className="monitorCard marketCard">
          <div className="cardHeading">
            <div>
              <p className="monitorLabel">Live Market</p>
              <h2>Order Book</h2>
            </div>
            <span className="chip">
              <FiRadio />
              {mode === "demo" ? "Synthetic pulse" : liveLoading ? "Refreshing" : "Gateway source"}
            </span>
          </div>

          <div className="marketTable">
            <div className="marketTableHead">
              <span>Seller ID</span>
              <span>Capability</span>
              <span>Price</span>
              <span>Status</span>
            </div>

            {market?.rows.length ? (
              market.rows.map((row) => (
                <div className="marketTableRow" key={`${row.sellerId}-${row.updatedAt}`}>
                  <span>{row.sellerId}</span>
                  <span>{row.capability}</span>
                  <span className="highlightText">{formatPrice(row.pricePerTask)}</span>
                  <span>{renderStatus(row.status)}</span>
                </div>
              ))
            ) : (
              <div className="emptyState">
                <FiLayers />
                <span>No sellers are visible yet.</span>
              </div>
            )}
          </div>
        </article>

        <article className="monitorCard feedCard">
          <div className="cardHeading">
            <div>
              <p className="monitorLabel">Realtime Transactions</p>
              <h2>Event Feed</h2>
            </div>
            <span className="chip">
              <FiClock />
              {mode === "demo" ? "Autostream" : "Events table"}
            </span>
          </div>

          <div className="feedList">
            {events?.items.length ? (
              events.items.map((event) => (
                <div className={classNames("feedRow", `feedRow${event.tone}`)} key={event.id}>
                  <div className="feedStamp">[{formatTime(event.timestamp)}]</div>
                  <div>
                    <strong>{event.title}</strong>
                    <p className="monitorSubtle">{event.message}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="emptyState">
                <FiRefreshCw />
                <span>No events have been recorded yet.</span>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="dashboardGridBottom">
        <article className="monitorCard chartCard">
          <div className="cardHeading">
            <div>
              <p className="monitorLabel">Network Demand vs Supply</p>
              <h2>Demand Curve</h2>
            </div>
            <div className="legend">
              <span>
                <i className="legendSwatch legendSupply" />
                Supply
              </span>
              <span>
                <i className="legendSwatch legendDemand" />
                Demand
              </span>
            </div>
          </div>

          {mode === "demo" ? (
            <DemandChart points={demoChart} />
          ) : (
            <div className="unavailableCard">
              <FiBarChart2 />
              <h3>No live source yet</h3>
              <p>
                Historical demand, volume and charted supply curves still need a dedicated analytics
                pipeline. The module stays visible so the future dashboard surface is explicit.
              </p>
            </div>
          )}
        </article>

        <article className="monitorCard settlementCard">
          <div className="cardHeading">
            <div>
              <p className="monitorLabel">Settlement Status</p>
              <h2>Payment Routing</h2>
            </div>
            <FiShield className="cardIcon" />
          </div>

          <div className="stackList">
            <div className="stackRow">
              <span>Primary</span>
              <strong>{summary?.settlement.primary ?? "Custom Escrow"}</strong>
            </div>
            <div className="stackRow">
              <span>Fallback</span>
              <strong>{summary?.settlement.fallback ?? "Mock"}</strong>
            </div>
            <div className="stackRow">
              <span>Future</span>
              <strong>{summary?.settlement.future ?? "Pieverse Facilitator"}</strong>
            </div>
          </div>

          <p className="monitorSubtle">
            Real Mode runs the current Gateway truth: Custom Escrow first, Mock as continuity
            fallback, Facilitator kept visible but not positioned as the primary path.
          </p>
        </article>
      </section>

      <section className="actionPanel">
        <article className="monitorCard actionCard">
          <div className="cardHeading">
            <div>
              <p className="monitorLabel">{mode === "demo" ? "Local Demo Flow" : "Gateway Run Panel"}</p>
              <h2>{mode === "demo" ? "Synthetic Action Stream" : "Quote, Verify, Monitor"}</h2>
            </div>
            <span className="chip">
              <FiSend />
              {mode === "demo" ? "Local only" : "Gateway-backed"}
            </span>
          </div>

          {mode === "demo" ? (
            <>
              <p className="monitorSubtle">
                Demo Mode keeps the layout live even without infrastructure. Metrics, table rows and
                the action flow all advance locally and never hit the API surface.
              </p>

              <div className="actionsRow">
                <button
                  className="primaryButton"
                  disabled={actionBusy}
                  onClick={() => {
                    void handleStartDemoFlow();
                  }}
                  type="button"
                >
                  {actionBusy ? "Streaming Demo..." : "Start Demo Flow"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="formGrid">
                <label className="field">
                  <span>Buyer ID</span>
                  <input value={buyerId} onChange={(event) => setBuyerId(event.target.value)} />
                </label>

                <label className="field">
                  <span>Capability</span>
                  <input value={capability} onChange={(event) => setCapability(event.target.value)} />
                </label>

                <label className="field fieldWide">
                  <span>Prompt</span>
                  <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
                </label>
              </div>

              <div className="radioRow" role="radiogroup" aria-label="Payment route">
                <button
                  aria-pressed={paymentRoute === "mock"}
                  className={classNames("segmentedButton", paymentRoute === "mock" && "segmentedButtonActive")}
                  onClick={() => setPaymentRoute("mock")}
                  type="button"
                >
                  Mock Fallback
                </button>
                <button
                  aria-pressed={paymentRoute === "escrow"}
                  className={classNames("segmentedButton", paymentRoute === "escrow" && "segmentedButtonActive")}
                  onClick={() => setPaymentRoute("escrow")}
                  type="button"
                >
                  Custom Escrow
                </button>
              </div>

              <p className="monitorSubtle">
                Custom Escrow is the real path. Wallet-triggered deposit creation is still external
                to this UI, so the escrow flow currently accepts a pasted tx hash. Mock remains the
                stable fallback for end-to-end verification.
              </p>

              <div className="actionsRow actionsRowWrap">
                <button
                  className="primaryButton"
                  disabled={actionBusy}
                  onClick={() => {
                    void handleRequestQuote();
                  }}
                  type="button"
                >
                  {actionBusy && !quote ? "Requesting Quote..." : "Request Quote"}
                </button>

                {quote && paymentRoute === "mock" ? (
                  <button
                    className="secondaryButton"
                    disabled={actionBusy}
                    onClick={() => {
                      void handleVerify(buildMockTxHash());
                    }}
                    type="button"
                  >
                    Verify Mock Fallback
                  </button>
                ) : null}
              </div>

              {quote && paymentRoute === "escrow" ? (
                <div className="escrowInline">
                  <label className="field fieldWide">
                    <span>Escrow deposit tx hash</span>
                    <input
                      placeholder="0x..."
                      value={txHashInput}
                      onChange={(event) => setTxHashInput(event.target.value)}
                    />
                  </label>
                  <button
                    className="secondaryButton"
                    disabled={actionBusy || txHashInput.trim() === ""}
                    onClick={() => {
                      void handleVerify(txHashInput.trim());
                    }}
                    type="button"
                  >
                    Verify Escrow Tx
                  </button>
                </div>
              ) : null}
            </>
          )}

          {actionError ? (
            <div className="inlineAlert">
              <FiAlertCircle />
              <span>{actionError}</span>
            </div>
          ) : null}

          <div className="receiptGrid">
            <div className="receiptCell">
              <span className="receiptLabel">payment_id</span>
              <strong>{quote?.payment_id ?? "pending"}</strong>
            </div>
            <div className="receiptCell">
              <span className="receiptLabel">seller_id</span>
              <strong>{quote?.seller_id ?? job?.seller_id ?? "pending"}</strong>
            </div>
            <div className="receiptCell">
              <span className="receiptLabel">job_id</span>
              <strong>{verify?.job_id ?? job?.job_id ?? "pending"}</strong>
            </div>
            <div className="receiptCell">
              <span className="receiptLabel">status</span>
              <strong>{job?.status ?? verify?.status ?? "pending"}</strong>
            </div>
          </div>

          <div className="resultBlock">
            <p className="monitorLabel">Result Stream</p>
            <p>{resultText}</p>
          </div>
        </article>

        <article className="monitorCard timelineCard">
          <div className="cardHeading">
            <div>
              <p className="monitorLabel">Flow Timeline</p>
              <h2>Execution Steps</h2>
            </div>
            <FiZap className="cardIcon" />
          </div>

          <Timeline steps={steps} />

          <div className="supportNote">
            <FiCode />
            <span>
              Current frontend covers the implemented Gateway APIs. Wallet UX, historical analytics
              and richer settlement intelligence remain marked rather than faked.
            </span>
          </div>
        </article>
      </section>

      <div className="dashboardFooter">
        <p>
          QuotaDEX is the first live service planned for AgentBazaar. This dashboard keeps the MVP
          execution surface visible without pretending unsupported live data already exists.
        </p>
        <Link className="textLink" href="/">
          Explore the landing page
          <FiArrowRight />
        </Link>
      </div>
    </main>
  );
}
