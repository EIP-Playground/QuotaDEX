"use client";

import { useMemo, useState } from "react";

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

type TimelineItem = {
  key: string;
  label: string;
  state: "pending" | "active" | "done" | "failed";
  detail?: string;
};

const DEFAULT_BUYER_ID = "buyer-demo";
const DEFAULT_CAPABILITY = "llama-3";
const DEFAULT_PROMPT = "hello from AgentMart demo";
const POLL_INTERVAL_MS = 1000;
const RESULT_TIMEOUT_MS = 30000;

function buildMockTxHash() {
  const hex = Date.now().toString(16).padStart(8, "0");
  return `0x${hex}abc123`;
}

function buildDemoRunBuyerId(buyerId: string) {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${buyerId.trim()}--run-${runId}`;
}

function buildInitialTimeline(): TimelineItem[] {
  return [
    { key: "quote", label: "Order requested", state: "pending" },
    { key: "payment", label: "402 payment required", state: "pending" },
    { key: "verify", label: "Payment verified", state: "pending" },
    { key: "running", label: "Seller running", state: "pending" },
    { key: "result", label: "Result delivered", state: "pending" }
  ];
}

function updateTimeline(
  items: TimelineItem[],
  key: string,
  state: TimelineItem["state"],
  detail?: string
) {
  return items.map((item) =>
    item.key === key
      ? {
          ...item,
          state,
          detail
        }
      : item
  );
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
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {
        error: text
      };
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    payload
  };
}

async function requestQuote(params: {
  buyerId: string;
  capability: string;
  prompt: string;
}) {
  const response = await gatewayJsonRequest("/api/v1/jobs/quote", {
    method: "POST",
    body: JSON.stringify({
      buyer_id: params.buyerId,
      capability: params.capability,
      prompt: params.prompt
    })
  });

  if (response.status !== 402 || !response.payload) {
    throw new Error(`Expected HTTP 402 from quote, received ${response.status}.`);
  }

  return response.payload as QuoteResponse;
}

async function verifyPayment(params: {
  buyerId: string;
  capability: string;
  prompt: string;
  quote: QuoteResponse;
}) {
  const txHash = buildMockTxHash();
  const response = await gatewayJsonRequest("/api/v1/jobs/verify", {
    method: "POST",
    body: JSON.stringify({
      fingerprint: params.quote.fingerprint,
      tx_hash: txHash,
      payload: {
        buyer_id: params.buyerId,
        capability: params.capability,
        prompt: params.prompt
      }
    })
  });

  if (!response.ok || !response.payload) {
    const payload = response.payload as { error?: string } | null;
    throw new Error(payload?.error ?? `Verify failed with status ${response.status}.`);
  }

  return {
    txHash,
    verify: response.payload as VerifyResponse
  };
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

export function AgentMartDemoClient() {
  const [buyerId, setBuyerId] = useState(DEFAULT_BUYER_ID);
  const [capability, setCapability] = useState(DEFAULT_CAPABILITY);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>(buildInitialTimeline);

  const receiptRows = useMemo(
    () => [
      ["payment_id", quote?.payment_id ?? job?.payment_id ?? "pending"],
      ["job_id", verify?.job_id ?? job?.job_id ?? "pending"],
      ["seller_id", quote?.seller_id ?? job?.seller_id ?? "pending"],
      ["tx_hash", txHash ?? "pending"],
      ["status", job?.status ?? verify?.status ?? "pending"],
      ["created_at", quote ? "captured during quote" : "pending"],
      ["completed_at", job?.result?.meta?.completed_at ?? "pending"]
    ],
    [job, quote, txHash, verify]
  );

  async function handleStartDemo() {
    setIsRunning(true);
    setError(null);
    setQuote(null);
    setVerify(null);
    setTxHash(null);
    setJob(null);
    setTimeline(buildInitialTimeline());

    try {
      const runtimeBuyerId = buildDemoRunBuyerId(buyerId);

      setTimeline((items) =>
        updateTimeline(items, "quote", "active", "Requesting service quote...")
      );

      const nextQuote = await requestQuote({
        buyerId: runtimeBuyerId,
        capability,
        prompt
      });

      setQuote(nextQuote);
      setTimeline((items) =>
        updateTimeline(items, "quote", "done", "Quote accepted by Gateway.")
      );
      setTimeline((items) =>
        updateTimeline(
          items,
          "payment",
          "done",
          `402 returned ${nextQuote.amount} ${nextQuote.currency}.`
        )
      );
      setTimeline((items) =>
        updateTimeline(items, "verify", "active", "Simulating mock payment verification...")
      );

      const payment = await verifyPayment({
        buyerId: runtimeBuyerId,
        capability,
        prompt,
        quote: nextQuote
      });

      setTxHash(payment.txHash);
      setVerify(payment.verify);
      setTimeline((items) =>
        updateTimeline(
          items,
          "verify",
          "done",
          `Job ${payment.verify.job_id} created after verify.`
        )
      );

      const finalJob = await waitForJobResult(payment.verify.job_id, (jobSnapshot) => {
        setJob(jobSnapshot);

        if (jobSnapshot.status === "paid") {
          setTimeline((items) =>
            updateTimeline(items, "running", "active", "Seller has been assigned the job.")
          );
        }

        if (jobSnapshot.status === "running") {
          setTimeline((items) =>
            updateTimeline(items, "running", "done", "Seller is executing the request.")
          );
          setTimeline((items) =>
            updateTimeline(items, "result", "active", "Waiting for final result...")
          );
        }
      });

      setJob(finalJob);
      setTimeline((items) =>
        updateTimeline(items, "running", "done", "Execution completed successfully.")
      );
      setTimeline((items) =>
        updateTimeline(items, "result", "done", "Result and receipt are ready.")
      );
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : "Unknown AgentMart demo error.";

      setError(message);
      setTimeline((items) =>
        items.map((item) =>
          item.state === "active"
            ? {
                ...item,
                state: "failed",
                detail: message
              }
            : item
        )
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="sectionStack">
      <div className="grid">
        <article className="card sectionStack">
          <div>
            <p className="sectionLabel">Order Input</p>
            <h2>Start the mock marketplace flow</h2>
          </div>

          <label className="field">
            <span className="fieldLabel">Buyer ID</span>
            <input
              className="input"
              value={buyerId}
              onChange={(event) => setBuyerId(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="fieldLabel">Capability</span>
            <input
              className="input"
              value={capability}
              onChange={(event) => setCapability(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="fieldLabel">Prompt</span>
            <textarea
              className="input textarea"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          <div className="actions actionsTight">
            <button
              className="button buttonPrimary buttonReset"
              disabled={isRunning}
              onClick={handleStartDemo}
              type="button"
            >
              {isRunning ? "Running Demo..." : "Start Demo"}
            </button>
          </div>

          {error ? <p className="errorText">{error}</p> : null}
        </article>

        <article className="card sectionStack">
          <div>
            <p className="sectionLabel">Flow Timeline</p>
            <h2>Progressive execution view</h2>
          </div>
          <div className="timeline">
            {timeline.map((item) => (
              <div className={`timelineItem timelineItem${item.state}`} key={item.key}>
                <div className="timelineMarker" />
                <div className="timelineContent">
                  <strong>{item.label}</strong>
                  <p className="bodyText compact">
                    {item.detail ??
                      (item.state === "pending" ? "Waiting to run." : "Completed.")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="grid">
        <article className="card sectionStack">
          <div>
            <p className="sectionLabel">Payment Trigger</p>
            <h2>402 response snapshot</h2>
          </div>
          <div className="receiptGrid">
            <div className="receiptField receiptFieldWide">
              <span className="receiptLabel">payment_id</span>
              <span className="receiptValue wrapValue">{quote?.payment_id ?? "pending"}</span>
            </div>
            <div className="receiptField">
              <span className="receiptLabel">amount</span>
              <span className="receiptValue">{quote?.amount ?? "pending"}</span>
            </div>
            <div className="receiptField">
              <span className="receiptLabel">currency</span>
              <span className="receiptValue">{quote?.currency ?? "pending"}</span>
            </div>
            <div className="receiptField receiptFieldWide">
              <span className="receiptLabel">pay_to</span>
              <span className="receiptValue scrollValue">{quote?.pay_to ?? "pending"}</span>
            </div>
          </div>
        </article>

        <article className="card sectionStack">
          <div>
            <p className="sectionLabel">Execution Status</p>
            <h2>Current job state</h2>
          </div>
          <div className="receiptGrid">
            <div className="receiptField">
              <span className="receiptLabel">job_id</span>
              <span className="receiptValue wrapValue">
                {verify?.job_id ?? job?.job_id ?? "pending"}
              </span>
            </div>
            <div className="receiptField">
              <span className="receiptLabel">seller_id</span>
              <span className="receiptValue">{job?.seller_id ?? quote?.seller_id ?? "pending"}</span>
            </div>
            <div className="receiptField">
              <span className="receiptLabel">status</span>
              <span className="receiptValue">{job?.status ?? verify?.status ?? "pending"}</span>
            </div>
            <div className="receiptField">
              <span className="receiptLabel">mode</span>
              <span className="receiptValue">mock</span>
            </div>
          </div>
        </article>
      </div>

      <div className="grid">
        <article className="card sectionStack">
          <div>
            <p className="sectionLabel">Result</p>
            <h2>Returned output</h2>
          </div>
          <pre>{job?.result?.text ?? "Result will appear here after the flow completes."}</pre>
        </article>

        <article className="card sectionStack">
          <div>
            <p className="sectionLabel">Receipt</p>
            <h2>Structured proof of execution</h2>
          </div>
          <div className="receiptGrid">
            {receiptRows.map(([label, value]) => (
              <div className="receiptField" key={label}>
                <span className="receiptLabel">{label}</span>
                <span className="receiptValue wrapValue">{value}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
