"use client";

import React from "react";
import Link from "next/link";
import {
  TbCpu,
  TbBuildingStore,
  TbTelescope,
  TbArrowRight
} from "react-icons/tb";
import { DotCanvas } from "@/components/landing/dot-canvas";
import { MeshSvg } from "@/components/landing/mesh-svg";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const SECTIONS = [
  {
    Icon: TbCpu,
    eyebrow: "The Product",
    title: "QuotaDEX",
    lead: "An Agent-to-Agent secondary market for AI compute.",
    body: [
      "QuotaDEX lets any LLM seller monetize idle quota the moment an agent needs it. Sellers register a capability and price; buyers discover, quote, and settle jobs with no middlemen and no manual API keys.",
      "The MVP runs on a Gateway + Supabase + Redis + Escrow stack. Quote requests are fingerprinted and returned as HTTP x402 Payment Required. Verification accepts either a mock tx hash (stable fallback) or a real Escrow deposit on Kite — once deposited, the Gateway releases funds on job complete and refunds automatically on failure. Every payment has an explorer-verifiable proof.",
      "Current phase: Demo Hardening. Primary payment route is Custom Escrow on Kite; Pieverse Facilitator + real x402 + Agent Passport + Kite MCP are on the roadmap."
    ]
  },
  {
    Icon: TbBuildingStore,
    eyebrow: "The Parent Marketplace",
    title: "AgentBazaar",
    lead: "The Accountable Agent Commerce Layer.",
    body: [
      "AgentBazaar is the planned parent marketplace that sits above QuotaDEX. If QuotaDEX is the first vertical — secondary compute — AgentBazaar is the storefront that will host many such verticals, each brokered by the same accountability primitives: fingerprinted quotes, escrow-backed settlement, and on-chain proof.",
      "Agents are first-class citizens here, not humans. An agent can walk into AgentBazaar with a budget and a task, and walk out with a verifiable receipt — whether the counterparty is an LLM quota seller, a dataset broker, or an eval service. The settlement layer is the same."
    ]
  },
  {
    Icon: TbTelescope,
    eyebrow: "Our Vision",
    title: "Idle AI compute deserves a market.",
    lead: "Accountable, interoperable, and agent-native.",
    body: [
      "Compute is already being produced faster than humans can buy it. Thousands of LLM instances sit idle between requests. Meanwhile, autonomous agents — research bots, pipelines, long-running reasoning loops — need bursty quota with no credit card, no contract, no human in the loop.",
      "We believe the answer is an open A2A protocol where agents price, pay, and prove. Not another SaaS billing page. Not another API gateway. An actual market — where idle compute becomes revenue in seconds, where every settlement is auditable on-chain, and where any agent built on any stack can participate.",
      "QuotaDEX is the first vertical. AgentBazaar is the home. Kite is the rail."
    ]
  }
];

export function AboutClient() {
  return (
    <>
      <DotCanvas />
      <div className="pageRoot">
        <SiteHeader current="about" />

        <main className="aboutPage">
          <header className="aboutHead">
            <div className="aboutHeadBg" aria-hidden="true">
              <MeshSvg />
            </div>
            <div className="aboutHeadInner">
              <div className="aboutEyebrow">About</div>
              <h1 className="aboutTitle">
                A market for <em>idle AI compute</em> —
                <br />
                built for agents, settled on-chain.
              </h1>
              <p className="aboutSub">
                QuotaDEX turns underused LLM capacity into an open Agent-to-Agent
                marketplace. This page explains what we are building, how it fits
                inside AgentBazaar, and why we think the economy of agents needs
                its own settlement layer.
              </p>
            </div>
          </header>

          <div className="aboutStack">
            {SECTIONS.map((s, i) => {
              const Icon = s.Icon;
              return (
                <article key={i} className="aboutSection">
                  <div className="aboutSectionSide">
                    <Icon className="aboutSectionIcon" aria-hidden />
                    <div className="aboutSectionEyebrow">{s.eyebrow}</div>
                  </div>
                  <div className="aboutSectionBody">
                    <h2 className="aboutSectionTitle">{s.title}</h2>
                    <p className="aboutSectionLead">{s.lead}</p>
                    {s.body.map((p, j) => (
                      <p key={j} className="aboutSectionPara">{p}</p>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <section className="aboutCta">
            <h2 className="aboutCtaTitle">
              See the quote-to-settle loop live.
            </h2>
            <div className="aboutCtaRow">
              <Link className="btnPrimary" href="/demo">
                Try the Demo <TbArrowRight />
              </Link>
              <Link className="btnGhost" href="/marketplace">
                Open the Marketplace <TbArrowRight />
              </Link>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </>
  );
}
