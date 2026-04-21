"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { DotCanvas } from "@/components/landing/dot-canvas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type VerifyResponse = { job_id: string; status: string };

type JobResponse = {
  job_id: string;
  payment_id: string;
  seller_id: string;
  status: string;
  result?: { text?: string; meta?: { job_id?: string; completed_at?: string }; error?: string } | null;
};

type StepState = "pending" | "active" | "done" | "failed";

type Step = { key: string; label: string; state: StepState; detail?: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const CAPABILITIES = ["llama-3", "gpt-4o", "mixtral-8x7b", "claude-haiku", "gemini-pro"];

const INITIAL_STEPS: Step[] = [
  { key: "register", label: "Register demo seller", state: "pending" },
  { key: "quote",    label: "Request quote (x402)",  state: "pending" },
  { key: "payment",  label: "402 Payment Required",  state: "pending" },
  { key: "verify",   label: "Verify mock payment",   state: "pending" },
  { key: "start",    label: "Seller starts job",     state: "pending" },
  { key: "complete", label: "Escrow.release → done", state: "pending" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockTxHash() {
  return `0x${Date.now().toString(16)}abc123`;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  return { status: res.status, ok: res.ok, payload };
}

async function apiGet(path: string) {
  const res = await fetch(path);
  const payload = await res.json();
  return { status: res.status, ok: res.ok, payload };
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIcon({ state }: { state: StepState }) {
  if (state === "done")    return <span className="demoStepIcon done">✓</span>;
  if (state === "failed")  return <span className="demoStepIcon failed">✕</span>;
  if (state === "active")  return <span className="demoStepIcon active" />;
  return <span className="demoStepIcon pending" />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DemoClient() {
  const [buyerId,    setBuyerId]    = useState("buyer-demo");
  const [capability, setCapability] = useState("llama-3");
  const [prompt,     setPrompt]     = useState("Summarize the benefits of on-chain escrow payments.");
  const [running,    setRunning]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [steps,      setSteps]      = useState<Step[]>(INITIAL_STEPS);
  const [quote,      setQuote]      = useState<QuoteResponse | null>(null);
  const [verifyRes,  setVerifyRes]  = useState<VerifyResponse | null>(null);
  const [txHash,     setTxHash]     = useState<string | null>(null);
  const [job,        setJob]        = useState<JobResponse | null>(null);

  function setStep(key: string, state: StepState, detail?: string) {
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, state, detail } : s))
    );
  }

  function failActive(msg: string) {
    setSteps((prev) =>
      prev.map((s) => (s.state === "active" ? { ...s, state: "failed", detail: msg } : s))
    );
  }

  async function run() {
    setRunning(true);
    setError(null);
    setQuote(null);
    setVerifyRes(null);
    setTxHash(null);
    setJob(null);
    setSteps(INITIAL_STEPS);

    const runId    = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const sellerId = `demo-seller-${capability}-${runId}`;
    const rBuyerId = `${buyerId.trim()}--${runId}`;
    const hash     = mockTxHash();

    try {
      // 1. Register demo seller
      setStep("register", "active", "Registering a temporary demo seller…");
      const regRes = await apiPost("/api/v1/sellers/register", {
        seller_id: sellerId,
        capability,
        price_per_task: "0.001",
        wallet: sellerId,
      });
      if (!regRes.ok) throw new Error(regRes.payload?.error ?? `Register failed (${regRes.status})`);
      setStep("register", "done", `Seller ${sellerId.slice(0, 20)}… online`);
      await delay(300);

      // 2. Request quote
      setStep("quote", "active", "Sending quote request to gateway…");
      const quoteRes = await apiPost("/api/v1/jobs/quote", {
        buyer_id: rBuyerId,
        capability,
        prompt,
      });
      if (quoteRes.status !== 402) throw new Error(`Expected HTTP 402 from quote, got ${quoteRes.status}`);
      const q = quoteRes.payload as QuoteResponse;
      setQuote(q);
      setStep("quote", "done", `Seller reserved · fingerprint captured`);

      // 3. Show 402
      setStep("payment", "active", `Gateway returned 402 · ${q.amount} ${q.currency} required`);
      await delay(600);
      setStep("payment", "done", `${q.amount} ${q.currency} owed · pay_to escrow set`);

      // 4. Verify mock payment
      setStep("verify", "active", "Simulating mock payment verification…");
      const verRes = await apiPost("/api/v1/jobs/verify", {
        fingerprint: q.fingerprint,
        tx_hash: hash,
        payload: { buyer_id: rBuyerId, capability, prompt },
      });
      if (!verRes.ok) throw new Error(verRes.payload?.error ?? `Verify failed (${verRes.status})`);
      const v = verRes.payload as VerifyResponse;
      setVerifyRes(v);
      setTxHash(hash);
      setStep("verify", "done", `Job ${v.job_id} created · status: paid`);
      await delay(400);

      // 5. Auto-start (simulating seller picking up job)
      setStep("start", "active", "Demo seller picking up job…");
      await delay(800);
      const startRes = await apiPost(`/api/v1/jobs/${v.job_id}/start`, { seller_id: sellerId });
      if (!startRes.ok) throw new Error(startRes.payload?.error ?? `Start failed (${startRes.status})`);
      setStep("start", "done", "Job status → running");
      await delay(700);

      // 6. Auto-complete with demo result
      setStep("complete", "active", "Seller completing job · triggering Escrow.release…");
      await delay(900);
      const demoResult = {
        text: `[Demo result] Prompt processed via ${capability}. Escrow released on Kite. Transaction: ${hash}`,
        meta: { job_id: v.job_id, completed_at: new Date().toISOString() },
      };
      const completeRes = await apiPost(`/api/v1/jobs/${v.job_id}/complete`, {
        seller_id: sellerId,
        result: demoResult,
      });
      if (!completeRes.ok) throw new Error(completeRes.payload?.error ?? `Complete failed (${completeRes.status})`);

      const jobFinal = await apiGet(`/api/v1/jobs/${v.job_id}`);
      setJob(jobFinal.payload as JobResponse);
      setStep("complete", "done", "Escrow.release called · job: done");

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      failActive(msg);
    } finally {
      setRunning(false);
    }
  }

  const isDone  = steps.every((s) => s.state === "done");
  const hasFail = steps.some((s)  => s.state === "failed");

  const receipt = useMemo(() => [
    ["payment_id",   quote?.payment_id  ?? job?.payment_id  ?? "—"],
    ["job_id",       verifyRes?.job_id  ?? job?.job_id      ?? "—"],
    ["seller_id",    quote?.seller_id   ?? job?.seller_id   ?? "—"],
    ["tx_hash",      txHash             ?? "—"],
    ["amount",       quote ? `${quote.amount} ${quote.currency}` : "—"],
    ["status",       job?.status        ?? verifyRes?.status ?? "—"],
    ["completed_at", job?.result?.meta?.completed_at ?? "—"],
  ], [quote, verifyRes, txHash, job]);

  return (
    <>
      <DotCanvas />
      <div className="pageRoot">
        <SiteHeader current="demo" />

        <main className="demoPage">
          {/* Page header */}
          <div className="demoPageHead">
            <Link className="demoBack" href="/marketplace">
              ← Back to Marketplace
            </Link>
            <div>
              <div className="demoEyebrow">A2A Demo · Mock Flow</div>
              <h1 className="demoTitle">Try QuotaDEX</h1>
              <p className="demoSub">
                Simulate the full <code>quote → verify → start → complete</code> loop with a
                self-contained mock seller. No real agent needed.
              </p>
            </div>
          </div>

          {/* Row 1: Form + Timeline */}
          <div className="demoGrid">
            {/* Form */}
            <article className="panel demoFormPanel">
              <h2>Job Input</h2>

              <div className="demoFields">
                <label className="demoField">
                  <span className="demoLabel">Buyer ID</span>
                  <input
                    className="demoInput"
                    value={buyerId}
                    onChange={(e) => setBuyerId(e.target.value)}
                    disabled={running}
                  />
                </label>

                <label className="demoField">
                  <span className="demoLabel">Capability</span>
                  <select
                    className="demoInput"
                    value={capability}
                    onChange={(e) => setCapability(e.target.value)}
                    disabled={running}
                  >
                    {CAPABILITIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>

                <label className="demoField">
                  <span className="demoLabel">Prompt</span>
                  <textarea
                    className="demoInput demoTextarea"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={running}
                    rows={3}
                  />
                </label>

                <div className="demoPaymentTag">
                  <span className="demoPaymentLabel">Payment mode</span>
                  <span className="demoPaymentValue">Mock fallback · auto tx hash</span>
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

            {/* Timeline */}
            <article className="panel">
              <h2>Execution Timeline</h2>
              <div className="demoTimeline">
                {steps.map((step, i) => (
                  <div key={step.key} className={`demoStep demoStep-${step.state}`}>
                    <div className="demoStepTrack">
                      <StepIcon state={step.state} />
                      {i < steps.length - 1 && (
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

          {/* Row 2: 402 Snapshot + Job State */}
          <div className="demoGrid">
            <article className="panel">
              <h2>402 Response <span className="hint">quote snapshot</span></h2>
              <div className="demoReceiptGrid">
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">payment_id</span>
                  <span className="demoReceiptVal mono">{quote?.payment_id ?? "—"}</span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">amount</span>
                  <span className="demoReceiptVal">{quote?.amount ?? "—"}</span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">currency</span>
                  <span className="demoReceiptVal">{quote?.currency ?? "—"}</span>
                </div>
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">pay_to</span>
                  <span className="demoReceiptVal mono small">{quote?.pay_to ?? "—"}</span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">expires_in</span>
                  <span className="demoReceiptVal">{quote?.expires_in_seconds != null ? `${quote.expires_in_seconds}s` : "—"}</span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">seller_id</span>
                  <span className="demoReceiptVal mono">{quote?.seller_id ?? "—"}</span>
                </div>
              </div>
            </article>

            <article className="panel">
              <h2>Job State <span className="hint">live status</span></h2>
              <div className="demoReceiptGrid">
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">job_id</span>
                  <span className="demoReceiptVal mono">{verifyRes?.job_id ?? job?.job_id ?? "—"}</span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">status</span>
                  <span className={`demoReceiptVal demoStatus-${job?.status ?? "pending"}`}>
                    {job?.status ?? verifyRes?.status ?? "—"}
                  </span>
                </div>
                <div className="demoReceiptRow">
                  <span className="demoReceiptKey">mode</span>
                  <span className="demoReceiptVal">mock</span>
                </div>
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">tx_hash</span>
                  <span className="demoReceiptVal mono small">{txHash ?? "—"}</span>
                </div>
                <div className="demoReceiptRow wide">
                  <span className="demoReceiptKey">completed_at</span>
                  <span className="demoReceiptVal mono small">{job?.result?.meta?.completed_at ?? "—"}</span>
                </div>
              </div>
            </article>
          </div>

          {/* Row 3: Result + Full Receipt */}
          <div className="demoGrid">
            <article className="panel">
              <h2>Result <span className="hint">returned by seller</span></h2>
              <pre className="demoResult">
                {job?.result?.text ?? "Result will appear here after the flow completes."}
              </pre>
            </article>

            <article className="panel">
              <h2>Full Receipt <span className="hint">proof of execution</span></h2>
              <div className="demoReceiptGrid">
                {receipt.map(([k, v]) => (
                  <div key={k} className="demoReceiptRow wide">
                    <span className="demoReceiptKey">{k}</span>
                    <span className="demoReceiptVal mono small">{v}</span>
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
