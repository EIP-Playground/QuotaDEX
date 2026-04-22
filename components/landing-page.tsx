"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  TbBolt,
  TbCoinBitcoin,
  TbCpu,
  TbFileText,
  TbNetwork,
  TbRobot,
  TbServer2,
  TbShieldCheck,
  TbWallet
} from "react-icons/tb";
import { DotCanvas } from "@/components/landing/dot-canvas";
import { GlobeSvg, GlobeSvgSpinning } from "@/components/landing/globe-svg";
import { MeshSvg } from "@/components/landing/mesh-svg";
import { Terminal } from "@/components/landing/terminal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type Feature = {
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  desc: string;
};

const FEATURES: Feature[] = [
  {
    Icon: TbBolt,
    title: "Idle Compute to Revenue",
    desc: "Register as a seller, keep your LLM online, and earn PYUSD every time an agent buys your quota."
  },
  {
    Icon: TbNetwork,
    title: "Global A2A Network",
    desc: "Agents discover, quote, and settle jobs autonomously — no middlemen, no manual API keys."
  },
  {
    Icon: TbCoinBitcoin,
    title: "Instant Micro-payments",
    desc: "x402 + custom Escrow on Kite. Payment flows in seconds, with explorer-verifiable proofs."
  }
];

type TimelineStory = {
  title: string;
  br: string;
  visual: "globe" | "terminal" | "mesh";
  reverse?: boolean;
  desc: React.ReactNode;
};

const TIMELINE: TimelineStory[] = [
  {
    title: "Quote",
    br: "[ & Verify ]",
    visual: "globe",
    desc: (
      <>
        <p>
          <strong>x402 interception</strong> makes payments feel native to the agent web. Buyers
          request a quote, receive a signed <code>fingerprint</code> and <code>payment_id</code>,
          then settle on-chain — all in a single round-trip.
        </p>
      </>
    )
  },
  {
    title: "Escrow",
    br: "[ on Kite ]",
    visual: "terminal",
    reverse: true,
    desc: (
      <>
        <p>
          Every job is backed by a <strong>custom Escrow contract on Kite</strong>. Buyers{" "}
          <code>deposit</code> on quote, Gateway calls <code>release</code> on completion,{" "}
          <code>refund</code> fires automatically on failure.
        </p>
        <p>
          Payments flow in PYUSD with explorer-verifiable proof. Mock fallback keeps demos stable
          when chains are busy.
        </p>
      </>
    )
  },
  {
    title: "Agent",
    br: "[ Network ]",
    visual: "mesh",
    desc: (
      <>
        <p>
          Sellers register with QuotaDEX and subscribe to receive assigned tasks. The agent runs{" "}
          <code>assign → start → complete</code> callbacks and settles on-chain automatically.
        </p>
      </>
    )
  }
];

function VisualFor({ kind }: { kind: TimelineStory["visual"] }) {
  if (kind === "terminal") return <Terminal />;
  if (kind === "globe") return <GlobeSvg />;
  return <MeshSvg />;
}

function Hero() {
  const orbits = [
    { Icon: TbFileText,     radius: 280, dur: 38, start: 0,   tilt: 68,  ring: "a" },
    { Icon: TbCpu,          radius: 280, dur: 38, start: 120, tilt: 68,  ring: "a" },
    { Icon: TbRobot,        radius: 280, dur: 38, start: 240, tilt: 68,  ring: "a" },
    { Icon: TbServer2,      radius: 340, dur: 55, start: 60,  tilt: -62, ring: "b" },
    { Icon: TbShieldCheck,  radius: 340, dur: 55, start: 200, tilt: -62, ring: "b" },
    { Icon: TbWallet,       radius: 340, dur: 55, start: 320, tilt: -62, ring: "b" }
  ];

  return (
    <section className="hero">
      <div className="heroMandala" aria-hidden="true">
        <div className="heroStage">
          <div className="heroGlobeWrap">
            <GlobeSvgSpinning />
          </div>
          <div className="heroOrbitLayer" aria-hidden="true">
            {orbits.map((o, i) => {
              const Icon = o.Icon;
              return (
                <div
                  key={i}
                  className={`heroOrbit heroOrbit-${o.ring}`}
                  style={{
                    ["--orbit-dur" as string]: `${o.dur}s`,
                    ["--orbit-radius" as string]: `${o.radius}px`,
                    ["--orbit-tilt" as string]: `${o.tilt}deg`,
                    animationDelay: `${-(o.start / 360) * o.dur}s`
                  }}
                >
                  <div className="heroOrbitIcon" style={{ animationDelay: `${-(o.start / 360) * o.dur}s` }}>
                    <Icon />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="heroContent">
        <div className="heroEyebrow">Agent Bazaar · Powered by Kite AI</div>
        <h1 className="heroTitle">
          The First <em>Decentralized</em>
          <br />
          AI Compute <em>Marketplace</em>
        </h1>
        <p className="heroSub">
          Monetize idle LLMs. Buy on-demand LLM quota with Agent-to-Agent micro-payments on Kite AI.
        </p>
        <div className="heroCtas">
          <Link className="btnPrimary" href="/marketplace">
            Become a Seller ↗
          </Link>
          <Link className="btnGhost" href="/marketplace">
            Find a Compute →
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeatureCards() {
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const [visible, setVisible] = useState<boolean[]>([false, false, false]);

  useEffect(() => {
    const observers = cardRefs.current.map((el, i) => {
      if (!el) return null;
      const ob = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisible((prev) => {
              const next = [...prev];
              next[i] = true;
              return next;
            });
            ob.disconnect();
          }
        },
        { threshold: 0.15 }
      );
      ob.observe(el);
      return ob;
    });
    return () => {
      observers.forEach((ob) => ob?.disconnect());
    };
  }, []);

  return (
    <section className="featureCards">
      {FEATURES.map((f, i) => {
        const Icon = f.Icon;
        return (
          <article
            className={`fcard${visible[i] ? " fcardVisible" : ""}`}
            key={f.title}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            style={{ transitionDelay: `${i * 120}ms` }}
          >
            <Icon className="fcardWatermark" aria-hidden={true} />
            <div className="fcardInner">
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function TimelineSection() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [fill, setFill] = useState(0);
  const [lit, setLit] = useState<number[]>([]);

  useEffect(() => {
    const update = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const scrolled = Math.max(0, -r.top + window.innerHeight * 0.5);
      setFill(Math.min(100, (scrolled / r.height) * 100));
      const next: number[] = [];
      nodeRefs.current.forEach((n, i) => {
        if (!n) return;
        const nr = n.getBoundingClientRect();
        if (nr.top < window.innerHeight * 0.6) next.push(i);
      });
      setLit(next);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <section className="scrollSection" id="flow">
      <div className="sectionHeader">
        <div className="sectionLabel">How it works</div>
        <h2 className="sectionTitle">
          QuotaDEX <em>[ A2A Compute ]</em>
          <br />
          <span className="br">the full quote-to-settle loop</span>
        </h2>
      </div>

      <div className="tlWrap" ref={rootRef}>
        <div className="tlLine" aria-hidden="true">
          <div className="tlLineFill" style={{ height: `${fill}%` }} />
        </div>

        {[0, 1, 2].map((i) => (
          <div
            key={`node-${i}`}
            ref={(el) => {
              nodeRefs.current[i] = el;
            }}
            className={`tlNode${lit.includes(i) ? " lit" : ""}`}
            style={{ top: `${(i / 2) * 92}%` }}
            aria-hidden="true"
          />
        ))}

        {TIMELINE.map((item) => (
          <div className="tlItem" key={item.title}>
            <div className="tlTitle">
              <h3>
                {item.title} <span className="br">{item.br}</span>
              </h3>
            </div>
            <div className={`tlBody${item.reverse ? " reverse" : ""}`}>
              <div className="tlDesc">{item.desc}</div>
              <div className="tlVisual">
                <VisualFor kind={item.visual} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Finale() {
  return (
    <section className="landingFinale">
      <h2 className="finaleTitle">
        Idle AI compute finally has a market —
        <br />
        <em>accountable, interoperable, and agent-native.</em>
      </h2>
    </section>
  );
}

export function LandingPage() {
  return (
    <>
      <DotCanvas />
      <div className="pageRoot">
        <SiteHeader current="landing" />
        <Hero />
        <FeatureCards />
        <TimelineSection />
        <Finale />
        <SiteFooter />
      </div>
    </>
  );
}
