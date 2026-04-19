import React from "react";
import Link from "next/link";
import {
  FiActivity,
  FiArrowRight,
  FiCheckCircle,
  FiCode,
  FiCpu,
  FiDollarSign,
  FiGlobe,
  FiShield
} from "react-icons/fi";
import { SiteHeader } from "@/components/site-header";

const moduleCards = [
  {
    title: "Marketplace",
    body: "Source live inference capacity from sellers who expose real capabilities to the Gateway.",
    icon: <FiGlobe />,
    detail: "Live inventory"
  },
  {
    title: "Gateway",
    body: "Quote, verify and route jobs through the same monitored execution path buyers already use.",
    icon: <FiCode />,
    detail: "402 payment flow"
  },
  {
    title: "Settlement",
    body: "Escrow-led payment stays primary while Mock remains the stable fallback for continuity.",
    icon: <FiShield />,
    detail: "Escrow first"
  }
];

const heroSignals = [
  { label: "Current real path", value: "Escrow-led" },
  { label: "Fallback route", value: "Mock" },
  { label: "Future parent platform", value: "AgentBazaar" }
];

const brandSections = [
  {
    id: "marketplace",
    heading: "QuotaDEX [Marketplace]",
    body:
      "Buyers ask for capability, the Gateway matches supply, and sellers turn idle quota into live market inventory.",
    bullets: ["Capability matching", "Seller-side monetization", "Agent-friendly order routing"],
    variant: "network",
    accent: "1,245 active sellers"
  },
  {
    id: "gateway",
    heading: "QuotaDEX [Escrow]",
    body:
      "Custom Escrow anchors the current payment path. Quote, verify and settlement stay legible instead of disappearing behind a hidden checkout.",
    bullets: ["402 quote challenge", "Verify before execution", "Mock fallback stays online"],
    variant: "escrow",
    accent: "Quote -> Verify -> Release"
  },
  {
    id: "monitor",
    heading: "QuotaDEX [Monitor]",
    body:
      "Operators can watch seller state, job flow, payment direction and feed activity in one continuous surface.",
    bullets: ["Realtime market table", "Event feed", "Live job polling"],
    variant: "monitor",
    accent: "Global Compute Monitor"
  }
];

const partnerMarks = ["Kite AI", "Polybius Capital", "Agent Protocol", "Olinte"];

export default function HomePage() {
  return (
    <main className="landingShell">
      <div className="landingBackdrop" aria-hidden="true">
        <div className="landingGlow landingGlowPrimary" />
        <div className="landingGlow landingGlowSecondary" />
        <div className="landingGrid" />
      </div>

      <SiteHeader current="landing" />

      <section className="heroStage">
        <div className="heroPattern" aria-hidden="true">
          <div className="heroPatternRing heroPatternRingOuter" />
          <div className="heroPatternRing heroPatternRingInner" />
          <div className="heroPatternNode heroPatternNodeOne">
            <FiCpu />
          </div>
          <div className="heroPatternNode heroPatternNodeTwo">
            <FiActivity />
          </div>
          <div className="heroPatternNode heroPatternNodeThree">
            <FiCheckCircle />
          </div>
          <div className="heroPatternNode heroPatternNodeFour">
            <FiDollarSign />
          </div>
        </div>

        <div className="heroStageInner">
          <p className="heroLabel">QuotaDEX</p>
          <h1 className="heroHeadline">The First Decentralized AI Compute Marketplace</h1>
          <p className="heroCopy">
            Quote, clear and monitor routed inference through one accountable Gateway. QuotaDEX is
            the first live service planned for AgentBazaar.
          </p>

          <div className="heroActions">
            <Link className="primaryButton" href="/dashboard">
              Open Dashboard
            </Link>
            <Link className="secondaryButton" href="/#gateway">
              See Gateway Flow
            </Link>
          </div>

          <div className="heroSignalRow">
            {heroSignals.map((signal) => (
              <div className="heroSignalCard" key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="trustBand" id="ecosystem">
        <p className="trustLabel">Backed by</p>
        <div className="trustMarks">
          {partnerMarks.map((partner) => (
            <span className="trustMark" key={partner}>
              {partner}
            </span>
          ))}
        </div>
      </section>

      <section className="moduleGrid">
        {moduleCards.map((card) => (
          <article className="moduleCard" key={card.title}>
            <div className="moduleCardVisual">
              <div className="moduleCardIcon">{card.icon}</div>
              <span className="moduleCardTag">{card.detail}</span>
            </div>
            <h2>{card.title}</h2>
            <p>{card.body}</p>
          </article>
        ))}
      </section>

      {brandSections.map((section, index) => (
        <section className="brandSection" id={section.id} key={section.heading}>
          <div className="brandSectionIntro">
            <p className="eyebrow">Brand Surface {index + 1}</p>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
            <ul className="brandBulletList">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>

          <div className={`brandVisual brandVisual${section.variant}`}>
            <div className="brandVisualTag">{section.accent}</div>

            {section.variant === "network" ? (
              <div className="visualBubbleCluster" aria-hidden="true">
                <div className="visualBubble visualBubbleLarge">Buyer mesh</div>
                <div className="visualBubble">Seller inventory</div>
                <div className="visualBubble">Realtime routing</div>
              </div>
            ) : null}

            {section.variant === "escrow" ? (
              <div className="visualFlow" aria-hidden="true">
                <div className="visualFlowStep">
                  <span>01</span>
                  <strong>Quote</strong>
                </div>
                <div className="visualFlowArrow" />
                <div className="visualFlowStep">
                  <span>02</span>
                  <strong>Verify</strong>
                </div>
                <div className="visualFlowArrow" />
                <div className="visualFlowStep">
                  <span>03</span>
                  <strong>Release</strong>
                </div>
              </div>
            ) : null}

            {section.variant === "monitor" ? (
              <div className="visualMonitor" aria-hidden="true">
                <div className="visualMonitorRow">
                  <span>seller-live-1</span>
                  <span className="visualMonitorAccent">idle</span>
                </div>
                <div className="visualMonitorRow">
                  <span>Execution completed</span>
                  <span>08:05:12</span>
                </div>
                <div className="visualMonitorRow">
                  <span>Demand vs Supply</span>
                  <span className="visualMonitorAccent">visible</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ))}

      <section className="ctaBanner">
        <div className="ctaBannerInner">
          <div>
            <p className="eyebrow">Next Layer</p>
            <h2>Build in the accountable compute economy.</h2>
            <p>
              QuotaDEX is the live vertical. AgentBazaar is the future marketplace context. The UI
              already speaks both languages without pretending the roadmap is finished.
            </p>
          </div>
          <Link className="secondaryButton ctaBannerButton" href="/dashboard">
            View Live Monitor
            <FiArrowRight />
          </Link>
        </div>
      </section>

      <footer className="siteFooter">
        <div className="siteFooterBrand">
          <span className="siteFooterMark">Q</span>
          <div>
            <strong>QuotaDEX</strong>
            <p>Autonomous compute commerce with real settlement visibility.</p>
          </div>
        </div>

        <div className="siteFooterLinks">
          <Link href="/#marketplace">Marketplace</Link>
          <Link href="/#gateway">Gateway</Link>
          <Link href="/#monitor">Monitor</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
      </footer>
    </main>
  );
}
