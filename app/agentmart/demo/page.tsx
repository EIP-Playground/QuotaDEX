import Link from "next/link";
import { AgentMartDemoClient } from "./pageClient";

const demoHighlights = [
  "One-click mock order flow",
  "HTTP 402 payment trigger",
  "Live execution status",
  "Structured result and receipt"
];

export default function AgentMartDemoPage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">AgentMart Demo</p>
        <h1>QuotaDEX is the first live service module inside AgentMart.</h1>
        <p className="lead">
          This page will become the live demo console. For now it locks the
          structure for the exact journey we want to show: service selection,
          payment trigger, execution progress, and final result plus receipt.
        </p>
        <div className="actions">
          <Link className="button buttonPrimary" href="/agentmart">
            Back To Storefront
          </Link>
          <Link className="button buttonSecondary" href="/">
            QuotaDEX Home
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="card sectionStack">
          <div>
            <p className="sectionLabel">Demo Scope</p>
            <h2>Live showcase</h2>
          </div>
          <ul>
            {demoHighlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="card sectionStack">
          <div>
            <p className="sectionLabel">Flow Mode</p>
            <h2>Current demo constraints</h2>
          </div>
          <ul>
            <li>Uses the existing QuotaDEX mock payment path.</li>
            <li>Does not require wallet connection.</li>
            <li>Reuses current Gateway APIs without backend changes.</li>
            <li>Designed for side-event product storytelling, not final UX.</li>
          </ul>
        </article>
      </section>

      <AgentMartDemoClient />
    </main>
  );
}
