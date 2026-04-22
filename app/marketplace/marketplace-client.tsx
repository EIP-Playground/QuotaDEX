"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  TbActivity,
  TbBolt,
  TbChartBar,
  TbChartLine,
  TbCircleCheck,
  TbCoin,
  TbPlayerPlay,
  TbShieldLock,
  TbTrophy,
  TbUsers
} from "react-icons/tb";
import { DotCanvas } from "@/components/landing/dot-canvas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type Seller = {
  id: string;
  cap: string;
  base: number;
  price: string;
  status: "idle" | "busy";
};

type Txn = {
  id: number;
  time: string;
  from: string;
  to: string;
  amt: string;
  cap: string;
};

type MarketRow = { sellerId: string; capability: string; pricePerTask: string; status: string };
type EventItem = { id: string; type: string; title: string; message: string; timestamp: string; jobId: string | null; tone: string };

const CAPS = ["GPT-4-Turbo", "Llama-3 8B", "Mixtral 8x7B", "Claude Haiku", "Gemini Pro", "Llama-3 70B"];
const AGENTS = ["Agent_X", "Agent_Y", "Agent_Z", "Agent_A7", "Agent_K2", "Agent_M9"];
const TOP_SELLERS = ["Alpha-Node-01", "Genesis-GPU", "Aurora-7x", "Nebula-K8", "Prime-Compute"];

function randomHex(len: number) {
  return Math.random().toString(16).slice(2, 2 + len).padEnd(len, "0");
}

function makeSeller(i: number): Seller {
  const base = 0.001 + Math.random() * 0.004;
  return {
    id: randomHex(8),
    cap: CAPS[i % CAPS.length],
    base,
    price: base.toFixed(4),
    status: Math.random() > 0.5 ? "busy" : "idle"
  };
}

function makeTxn(offsetSec: number, seed: number): Txn {
  const d = new Date(Date.now() - offsetSec * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return {
    id: seed,
    time: `${hh}:${mm}:${ss}`,
    from: AGENTS[Math.floor(Math.random() * AGENTS.length)],
    to: AGENTS[Math.floor(Math.random() * AGENTS.length)],
    amt: (0.001 + Math.random() * 0.009).toFixed(3),
    cap: CAPS[Math.floor(Math.random() * CAPS.length)]
  };
}

function Sparkline({ data, color = "#c8a435" }: { data: number[]; color?: string }) {
  const W = 100;
  const H = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [i * (W / (data.length - 1)), H - ((v - min) / range) * (H - 4) - 2]);
  const d = pts.map((p, i) => (i ? `L${p[0]},${p[1]}` : `M${p[0]},${p[1]}`)).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 32, display: "block", marginTop: 6 }}>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={color} fillOpacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.3" />
    </svg>
  );
}

function DemandChart() {
  const { demand, supply, max } = useMemo(() => {
    const dem = Array.from(
      { length: 48 },
      (_, i) => 50 + Math.sin(i * 0.2) * 30 + Math.sin(i * 0.7) * 12 + Math.random() * 6
    );
    const sup = Array.from(
      { length: 48 },
      (_, i) => 55 + Math.sin(i * 0.18 + 1.5) * 28 + Math.sin(i * 0.6) * 10 + Math.random() * 5
    );
    return { demand: dem, supply: sup, max: Math.max(...dem, ...sup) + 10 };
  }, []);

  const W = 600;
  const H = 180;
  const toPath = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = i * (W / (arr.length - 1));
        const y = H - (v / max) * (H - 20) - 10;
        return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const dPath = toPath(demand);
  const sPath = toPath(supply);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 180 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="dGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#c8a435" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#c8a435" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3a4a1a" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3a4a1a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 80, 120, 160].map((y) => (
        <line
          key={y}
          x1="0"
          x2={W}
          y1={y}
          y2={y}
          stroke="#3c3214"
          strokeOpacity="0.06"
          strokeDasharray="2,3"
        />
      ))}
      <path d={`${dPath} L${W},${H} L0,${H} Z`} fill="url(#dGrad)" />
      <path d={dPath} fill="none" stroke="#c8a435" strokeWidth="1.8" />
      <path d={`${sPath} L${W},${H} L0,${H} Z`} fill="url(#sGrad)" />
      <path d={sPath} fill="none" stroke="#3a4a1a" strokeWidth="1.8" strokeDasharray="4,4" />
    </svg>
  );
}

function ModeSwitch({ mode, onChange }: { mode: "demo" | "live"; onChange: (m: "demo" | "live") => void }) {
  return (
    <div className="modeSwitch">
      {(["demo", "live"] as const).map((m) => (
        <button
          key={m}
          className={`modeSwitchBtn${mode === m ? " active" : ""}`}
          onClick={() => onChange(m)}
        >
          {m === "demo" ? "Demo" : "Live"}
        </button>
      ))}
    </div>
  );
}

export function MarketplaceClient() {
  const [mode, setMode] = useState<"demo" | "live">("demo");

  const [orderBook, setOrderBook] = useState<Seller[]>(() =>
    Array.from({ length: 9 }, (_, i) => makeSeller(i))
  );
  const [stats, setStats] = useState({
    agents: 1245,
    price: 0.002,
    vol: 150000,
    jobs: 1_523_412
  });
  const [txns, setTxns] = useState<Txn[]>(() =>
    Array.from({ length: 6 }, (_, i) => makeTxn(i * 3, i))
  );
  const [settlements, setSettlements] = useState<Array<{ id: string; cap: string; amount: string }>>(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        id: `0x${randomHex(8)}…${randomHex(4)}`,
        cap: CAPS[i % 3],
        amount: (0.002 + Math.random() * 0.005).toFixed(3)
      }))
  );

  // Demo mode: animated mock data
  useEffect(() => {
    if (mode !== "demo") return;

    const feedTimer = window.setInterval(() => {
      setTxns((prev) => [makeTxn(0, Date.now()), ...prev].slice(0, 8));
    }, 2500);
    const statsTimer = window.setInterval(() => {
      setOrderBook((prev) =>
        prev.map((s) => ({
          ...s,
          price: (s.base + Math.random() * 0.002 - 0.001).toFixed(4),
          status: Math.random() > 0.55 ? "busy" : "idle"
        }))
      );
      setStats((s) => ({
        agents: s.agents + Math.floor(Math.random() * 4 - 1),
        price: 0.002 + Math.random() * 0.001 - 0.0005,
        vol: s.vol + Math.floor(Math.random() * 80),
        jobs: s.jobs + Math.floor(Math.random() * 5)
      }));
      setSettlements(
        Array.from({ length: 5 }, (_, i) => ({
          id: `0x${randomHex(8)}…${randomHex(4)}`,
          cap: CAPS[i % 3],
          amount: (0.002 + Math.random() * 0.005).toFixed(3)
        }))
      );
    }, 1800);
    return () => {
      window.clearInterval(feedTimer);
      window.clearInterval(statsTimer);
    };
  }, [mode]);

  // Live mode: real API polling
  useEffect(() => {
    if (mode !== "live") return;

    async function fetchAll() {
      try {
        const [summaryRes, marketRes, eventsRes] = await Promise.all([
          fetch("/api/v1/dashboard/summary"),
          fetch("/api/v1/dashboard/market"),
          fetch("/api/v1/dashboard/events")
        ]);
        const summary = await summaryRes.json();
        const market = await marketRes.json();
        const events = await eventsRes.json();

        const rows: MarketRow[] = market.rows ?? [];
        const avgPrice = rows.length
          ? rows.reduce((s, r) => s + parseFloat(r.pricePerTask), 0) / rows.length
          : 0;

        setStats({
          agents: summary.metrics?.activeSellers ?? 0,
          price: avgPrice,
          vol: Math.round((summary.metrics?.completedJobs ?? 0) * avgPrice * 1000),
          jobs: summary.metrics?.completedJobs ?? 0
        });

        setOrderBook(
          rows.slice(0, 9).map((r) => ({
            id: r.sellerId,
            cap: r.capability,
            base: parseFloat(r.pricePerTask),
            price: parseFloat(r.pricePerTask).toFixed(4),
            status: r.status === "idle" ? "idle" : "busy"
          }))
        );

        const items: EventItem[] = events.items ?? [];
        setTxns(
          items.slice(0, 8).map((e, i) => ({
            id: i,
            time: new Date(e.timestamp).toLocaleTimeString("en-US", { hour12: false }),
            from: e.jobId ? `Job_${e.jobId.slice(0, 6)}` : "System",
            to: "QuotaDEX",
            amt: "—",
            cap: e.title
          }))
        );

        const settled = items.filter((e) => e.type === "RELEASED" || e.type === "REFUNDED");
        setSettlements(
          settled.slice(0, 5).map((e) => ({
            id: `0x${e.id.slice(0, 8)}…${e.id.slice(-4)}`,
            cap: `${e.type} · ${e.jobId?.slice(0, 8) ?? "—"}`,
            amount: "—"
          }))
        );
      } catch {
        // silently keep previous state on fetch error
      }
    }

    fetchAll();
    const t = window.setInterval(fetchAll, 5000);
    return () => window.clearInterval(t);
  }, [mode]);

  return (
    <>
      <DotCanvas />
      <div className="pageRoot">
        <SiteHeader current="marketplace" />

        <main className="dash">
          <header className="dashHead">
            <div>
              <h1>
                Global <span>Compute</span> Monitor
              </h1>
              <p>Real-time A2A marketplace activity across the Kite network</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <ModeSwitch mode={mode} onChange={setMode} />
              <div className="dashLive">
                {mode === "live" ? "LIVE · Kite Mainnet" : "DEMO · Simulated"}
              </div>
            </div>
          </header>

          <section className="statRow">
            <article className="stat">
              <div className="statLabel"><TbUsers /> Active Agents</div>
              <div className="statVal">{stats.agents.toLocaleString()}</div>
              <div className="statDelta">+12 in last hour</div>
              <Sparkline data={[40, 45, 48, 50, 52, 58, 62, 64, 66, 70, 72, 75]} />
            </article>
            <article className="stat">
              <div className="statLabel"><TbCoin /> Avg Price / 1k tokens</div>
              <div className="statVal">
                {stats.price.toFixed(4)}
                <span className="small">PYUSD</span>
              </div>
              <div className="statDelta down">−2.4% vs yesterday</div>
              <Sparkline data={[3, 3.2, 2.9, 2.7, 2.5, 2.6, 2.4, 2.5, 2.3, 2.2, 2.1, 2.0]} />
            </article>
            <article className="stat">
              <div className="statLabel"><TbChartBar /> 24h Volume</div>
              <div className="statVal">
                {(stats.vol / 1000).toFixed(1)}k<span className="small">PYUSD</span>
              </div>
              <div className="statDelta">+18.3% vs yesterday</div>
              <Sparkline data={[50, 55, 60, 65, 62, 70, 75, 80, 85, 90, 92, 95]} />
            </article>
            <article className="stat">
              <div className="statLabel"><TbCircleCheck /> Total Jobs Settled</div>
              <div className="statVal">{stats.jobs >= 1e6 ? `${(stats.jobs / 1e6).toFixed(2)}M+` : stats.jobs.toLocaleString()}</div>
              <div className="statDelta">+4,231 today</div>
              <Sparkline data={[30, 35, 40, 42, 48, 55, 60, 68, 74, 80, 86, 92]} />
            </article>
          </section>

          <section className="dashGrid">
            <article className="panel">
              <h2>
                <span><TbBolt /> Live Market · Order Book</span> <span className="hint">updates every {mode === "live" ? "5s" : "1.8s"}</span>
              </h2>
              <table className="obTable">
                <thead>
                  <tr>
                    <th>Seller</th>
                    <th>Capability</th>
                    <th>Price (PYUSD)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orderBook.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: "24px 0" }}>
                        No sellers online
                      </td>
                    </tr>
                  ) : (
                    orderBook.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="obSeller">
                            0x{s.id.slice(0, 4)}…{s.id.slice(-2)}
                          </span>
                        </td>
                        <td style={{ color: "var(--muted)" }}>{s.cap}</td>
                        <td className="obPrice">{s.price}</td>
                        <td>
                          <span className={`obStatus ${s.status}`}>{s.status}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </article>

            <article className="panel">
              <h2>
                <span><TbActivity /> Real-time Transactions</span> <span className="hint">{txns.length} events</span>
              </h2>
              <div className="txnFeed">
                {txns.length === 0 ? (
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "12px 0" }}>
                    No events yet
                  </div>
                ) : (
                  txns.map((t) => (
                    <div key={t.id} className="txn">
                      <div className="txnTime">[{t.time}]</div>
                      <div className="txnMsg">
                        {mode === "live" ? (
                          <>
                            <b>{t.from}</b> → <b>{t.to}</b>
                            {" · "}
                            <span style={{ color: "var(--muted)" }}>{t.cap}</span>
                          </>
                        ) : (
                          <>
                            <b>{t.from}</b> paid <span className="amt">{t.amt} PYUSD</span> to{" "}
                            <b>{t.to}</b> for {t.cap} task
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="dashGrid">
            <article className="panel chartPanel" style={{ gridColumn: "1 / 3" }}>
              <h2>
                <span><TbChartLine /> Network Demand vs Supply</span> <span className="hint">last 24 hours</span>
              </h2>
              <div className="chartLegend">
                <span>
                  <i style={{ background: "#c8a435" }} />
                  Demand
                </span>
                <span>
                  <i
                    style={{
                      background: "#3a4a1a",
                      borderTop: "1px dashed #3a4a1a"
                    }}
                  />
                  Supply
                </span>
              </div>
              <DemandChart />
              <div className="chartAxisLabels">
                <span>00:00</span>
                <span>04:00</span>
                <span>08:00</span>
                <span>12:00</span>
                <span>16:00</span>
                <span>20:00</span>
                <span>24:00</span>
              </div>
            </article>
          </section>

          <section className="dashBottom">
            <article className="panel">
              <h2>
                <span><TbTrophy /> Top Sellers · 24h</span> <span className="hint">by volume</span>
              </h2>
              <div className="agentList">
                {mode === "live" && orderBook.length === 0 ? (
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "12px 0" }}>
                    No sellers registered
                  </div>
                ) : mode === "live" ? (
                  orderBook.slice(0, 5).map((s, i) => (
                    <div key={s.id} className="agent">
                      <div>
                        <div className="agentId">
                          0x{s.id.slice(0, 6)}…{s.id.slice(-4)}
                        </div>
                        <div className="agentCap">{s.cap} · {s.status}</div>
                      </div>
                      <div className="agentScore">{s.price} PYUSD</div>
                    </div>
                  ))
                ) : (
                  TOP_SELLERS.map((a, i) => (
                    <div key={a} className="agent">
                      <div>
                        <div className="agentId">{a}</div>
                        <div className="agentCap">GPT-4-Turbo · Llama-3 · {3 + i} capabilities</div>
                      </div>
                      <div className="agentScore">{(12.4 - i * 1.8).toFixed(1)}k PYUSD</div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="panel">
              <h2>
                <span><TbShieldLock /> Recent Escrow Settlements</span> <span className="hint">on-chain proof</span>
              </h2>
              <div className="agentList">
                {mode === "live" && settlements.length === 0 ? (
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "12px 0" }}>
                    No settlements yet
                  </div>
                ) : (
                  settlements.map((s, i) => (
                    <div key={`${s.id}-${i}`} className="agent">
                      <div>
                        <div className="agentId">{s.id}</div>
                        <div className="agentCap">
                          {mode === "live" ? s.cap : `Escrow.release · ${s.cap}`}
                        </div>
                      </div>
                      <div className="agentScore">{s.amount === "—" ? "—" : `+${s.amount}`}</div>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>
        </main>

        <SiteFooter />
      </div>

      <Link
        href="/demo"
        className={`tryItBtn${mode === "live" ? " hidden" : ""}`}
        aria-hidden={mode === "live"}
      >
        <TbPlayerPlay /> Try It
      </Link>
    </>
  );
}
