"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { DotCanvas } from "@/components/landing/dot-canvas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type DemoRunResponse = {
  status: "done";
  payment_mode: "demo-direct-escrow";
  run_id: string;
  quote: {
    payment_id: string;
    fingerprint: string;
    buyer_id: string;
    seller_id: string;
    pay_to: string;
    amount: string;
    amount_atomic: string;
    currency: string;
    payment_asset: string;
    network: string;
    chain_id: string;
  };
  payment: {
    settlement_tx_hash: string;
    escrow_registration_tx_hash: string;
    release_tx_hash: string;
  };
  job: {
    job_id: string;
    status: string;
    result?: {
      text?: string;
      meta?: {
        completed_at?: string;
        release_tx_hash?: string;
      };
    } | null;
  };
  explorer: {
    escrow: string;
    settlement: string;
    escrow_registration: string;
    release: string;
  };
};

type StepState = "pending" | "active" | "done" | "failed";
type Step = { key: string; label: string; state: StepState; detail?: string };

const CAPABILITIES = ["llama-3", "gpt-4o", "mixtral-8x7b", "claude-haiku", "gemini-pro"];

const INITIAL_STEPS: Step[] = [
  { key: "preflight", label: "Check demo wallets", state: "pending" },
  { key: "seller", label: "Register seller agent", state: "pending" },
  { key: "payment", label: "Buyer pays Test USDT", state: "pending" },
  { key: "register", label: "Gateway registers escrow", state: "pending" },
  { key: "complete", label: "Seller completes job", state: "pending" },
  { key: "release", label: "Escrow.release to seller", state: "pending" }
];

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function apiPost<T>(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let payload: T | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as T;
    } catch {
      payload = null;
    }
  }

  return { status: res.status, ok: res.ok, payload };
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <span className="demoStepIcon done">✓</span>;
  if (state === "failed") return <span className="demoStepIcon failed">✕</span>;
  if (state === "active") return <span className="demoStepIcon active" />;
  return <span className="demoStepIcon pending" />;
}

function shortHash(value?: string) {
  if (!value || value.length < 14) {
    return value ?? "—";
  }

  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function ReceiptValue({
  value,
  href
}: {
  value?: string;
  href?: string;
}) {
  const displayValue = value || "—";

  if (!href || !value) {
    return <span className="demoReceiptVal mono small">{displayValue}</span>;
  }

  return (
    <a
      className="demoReceiptVal mono small demoReceiptLink"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {displayValue}
    </a>
  );
}

export function DemoClient() {
  const [capability, setCapability] = useState("llama-3");
  const [prompt, setPrompt] = useState("Summarize the benefits of on-chain escrow payments.");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [runResult, setRunResult] = useState<DemoRunResponse | null>(null);

  function setStep(key: string, state: StepState, detail?: string) {
    setSteps((prev) =>
      prev.map((step) => (step.key === key ? { ...step, state, detail } : step))
    );
  }

  function failActive(message: string) {
    setSteps((prev) =>
      prev.map((step) =>
        step.state === "active" ? { ...step, state: "failed", detail: message } : step
      )
    );
  }

  async function run() {
    setRunning(true);
    setError(null);
    setRunResult(null);
    setSteps(INITIAL_STEPS);

    try {
      setStep("preflight", "active", "Gateway is checking Kite Testnet config and demo wallets…");
      const response = await apiPost<DemoRunResponse>("/api/v1/demo/run", {
        capability,
        prompt
      });

      if (!response.ok || !response.payload) {
        const payload = response.payload as { error?: string; details?: { reason?: string } } | null;
        throw new Error(
          payload?.details?.reason ??
            payload?.error ??
            `Demo failed with status ${response.status}.`
        );
      }

      const result = response.payload;
      setRunResult(result);

      setStep("preflight", "done", `Buyer ${shortHash(result.quote.buyer_id)} ready`);
      await delay(180);
      setStep("seller", "done", `Seller ${shortHash(result.quote.seller_id)} registered`);
      await delay(180);
      setStep("payment", "done", `Settlement ${shortHash(result.payment.settlement_tx_hash)}`);
      await delay(180);
      setStep("register", "done", `Registration ${shortHash(result.payment.escrow_registration_tx_hash)}`);
      await delay(180);
      setStep("complete", "done", `Job ${result.job.job_id} completed`);
      await delay(180);
      setStep("release", "done", `Release ${shortHash(result.payment.release_tx_hash)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown demo error";
      setError(message);
      failActive(message);
    } finally {
      setRunning(false);
    }
  }

  const isDone = steps.every((step) => step.state === "done");
  const hasFail = steps.some((step) => step.state === "failed");

  const receipt = useMemo(() => [
    { key: "run_id", value: runResult?.run_id },
    { key: "payment_id", value: runResult?.quote.payment_id },
    { key: "job_id", value: runResult?.job.job_id },
    { key: "buyer", value: runResult?.quote.buyer_id },
    { key: "seller", value: runResult?.quote.seller_id },
    {
      key: "amount",
      value: runResult ? `${runResult.quote.amount} ${runResult.quote.currency}` : undefined
    },
    {
      key: "settlement_tx",
      value: runResult?.payment.settlement_tx_hash,
      href: runResult?.explorer.settlement
    },
    {
      key: "registration_tx",
      value: runResult?.payment.escrow_registration_tx_hash,
      href: runResult?.explorer.escrow_registration
    },
    {
      key: "release_tx",
      value: runResult?.payment.release_tx_hash,
      href: runResult?.explorer.release
    },
    { key: "status", value: runResult?.job.status }
  ], [runResult]);

  return (
    <>
      <DotCanvas />
      <div className="pageRoot">
        <SiteHeader current="demo" />

        <main className="demoPage">
          <div className="demoPageHead">
            <Link className="demoBack" href="/marketplace">
              ← Back to Marketplace
            </Link>
            <div>
              <div className="demoEyebrow">A2A Demo · Kite Testnet</div>
              <h1 className="demoTitle">Try QuotaDEX</h1>
              <p className="demoSub">
                Run a controlled <code>Buyer → Escrow → Seller</code> happy path with
                server-side demo wallets, Test USDT, and the verified Kite Testnet escrow.
              </p>
            </div>
          </div>

          <div className="demoGrid">
            <article className="panel demoFormPanel">
              <h2>Job Input</h2>

              <div className="demoFields">
                <label className="demoField">
                  <span className="demoLabel">Capability</span>
                  <select
                    className="demoInput"
                    value={capability}
                    onChange={(event) => setCapability(event.target.value)}
                    disabled={running}
                  >
                    {CAPABILITIES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>

                <label className="demoField">
                  <span className="demoLabel">Prompt</span>
                  <textarea
                    className="demoInput demoTextarea"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    disabled={running}
                    rows={3}
                  />
                </label>

                <div className="demoPaymentTag">
                  <span className="demoPaymentLabel">Payment mode</span>
                  <span className="demoPaymentValue">Kite Testnet USDT · real escrow release</span>
                </div>
              </div>

              <div style={{ marginTop: "auto", paddingTop: 20 }}>
                <button
                  className={`demoRunBtn${running ? " running" : ""}`}
                  onClick={run}
                  disabled={running}
                >
                  {running ? (
                    <><span className="demoSpinner" /> Running…</>
                  ) : isDone ? "Run Again ↺" : hasFail ? "Retry →" : "Start Demo →"}
                </button>
                {error && <p className="demoError">{error}</p>}
              </div>
            </article>

            <article className="panel">
              <h2>Execution Timeline</h2>
              <div className="demoTimeline">
                {steps.map((step, index) => (
                  <div key={step.key} className={`demoStep demoStep-${step.state}`}>
                    <div className="demoStepTrack">
                      <StepIcon state={step.state} />
                      {index < steps.length - 1 && (
                        <div className={`demoStepLine${step.state === "done" ? " lit" : ""}`} />
                      )}
                    </div>
                    <div className="demoStepBody">
                      <div className="demoStepLabel">{step.label}</div>
                      {step.detail && (
                        <div className="demoStepDetail">{step.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="demoGrid">
            <article className="panel">
              <h2>Payment Snapshot <span className="hint">Kite Testnet</span></h2>
              <div className="demoReceiptGrid">
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">payment_id</span>
                  <span className="demoReceiptVal mono">{runResult?.quote.payment_id ?? "—"}</span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">amount</span>
                  <span className="demoReceiptVal">{runResult?.quote.amount ?? "—"}</span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">currency</span>
                  <span className="demoReceiptVal">{runResult?.quote.currency ?? "—"}</span>
                </div>
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">pay_to</span>
                  <ReceiptValue
                    value={runResult?.quote.pay_to}
                    href={runResult?.explorer.escrow}
                  />
                </div>
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">asset</span>
                  <span className="demoReceiptVal mono small">{runResult?.quote.payment_asset ?? "—"}</span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">chain</span>
                  <span className="demoReceiptVal">{runResult?.quote.chain_id ?? "—"}</span>
                </div>
              </div>
            </article>

            <article className="panel">
              <h2>Job State <span className="hint">release proof</span></h2>
              <div className="demoReceiptGrid">
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">job_id</span>
                  <span className="demoReceiptVal mono">{runResult?.job.job_id ?? "—"}</span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">status</span>
                  <span className={`demoReceiptVal demoStatus-${runResult?.job.status ?? "pending"}`}>
                    {runResult?.job.status ?? "—"}
                  </span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">mode</span>
                  <span className="demoReceiptVal">{runResult?.payment_mode ?? "—"}</span>
                </div>
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">release_tx</span>
                  <ReceiptValue
                    value={runResult?.payment.release_tx_hash}
                    href={runResult?.explorer.release}
                  />
                </div>
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">completed_at</span>
                  <span className="demoReceiptVal mono small">{runResult?.job.result?.meta?.completed_at ?? "—"}</span>
                </div>
              </div>
            </article>
          </div>

          <div className="demoGrid">
            <article className="panel">
              <h2>Result <span className="hint">returned by seller</span></h2>
              <pre className="demoResult">
                {runResult?.job.result?.text ?? "Result will appear here after the flow completes."}
              </pre>
            </article>

            <article className="panel">
              <h2>Full Receipt <span className="hint">video script proof points</span></h2>
              <div className="demoReceiptGrid">
                {receipt.map((item) => (
                  <div key={item.key} className="demoReceiptRow wide">
                    <span className="demoReceiptKey">{item.key}</span>
                    <ReceiptValue value={item.value} href={item.href} />
                  </div>
                ))}
              </div>
            </article>
          </div>
        </main>

        <SiteFooter />
      </div>
    </>
  );
}
