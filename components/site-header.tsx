"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type SiteHeaderProps = {
  current: "landing" | "marketplace" | "demo" | "about";
};

const LINKS = [
  { href: "/", label: "Home", key: "landing" as const },
  { href: "/marketplace", label: "Marketplace", key: "marketplace" as const },
  { href: "#", label: "Developers", key: "developers" as const },
  { href: "#", label: "Ecosystem", key: "ecosystem" as const },
  { href: "/about", label: "About", key: "about" as const }
];

const PROMPT_OPTIONS = [
  {
    label: "Copy Buyer Prompt",
    prompt:
      "Read https://quota-dex.vercel.app/skills/quotadex-buyer/SKILL.md and follow every step in order to onboard yourself as a QuotaDEX Buyer Agent. In order further usage, you can install this skill.",
    role: "buyer",
    subtitle: "Buyer Agent"
  },
  {
    label: "Copy Seller Prompt",
    prompt:
      "Read https://quota-dex.vercel.app/skills/quotadex-seller/SKILL.md and follow every step in order to onboard yourself as a QuotaDEX Seller Agent. In order further usage, you can install this skill.",
    role: "seller",
    subtitle: "Seller Agent"
  }
] as const;

type PromptRole = (typeof PROMPT_OPTIONS)[number]["role"];
type CopyState = PromptRole | "failed" | null;

export function SiteHeader({ current }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`siteNav${scrolled ? " scrolled" : ""}`}>
      <div className="siteNavInner">
        <Link aria-label="QuotaDEX home" className="siteLogo" href="/">
          <Image
            alt="QuotaDEX logo"
            className="siteLogoImage"
            height={44}
            priority
            src="/QuotaDEX-logo.png"
            width={44}
          />
          <span className="siteLogoText">QuotaDEX</span>
        </Link>

        <ul className="siteNavLinks">
          {LINKS.map((item) => {
            const isActive = item.key === current;
            const className = `siteNavLink${isActive ? " active" : ""}`;
            if (item.key === "landing" || item.key === "marketplace" || item.key === "about") {
              return (
                <li key={item.key}>
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={className}
                    href={item.href}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            }
            return (
              <li key={item.key}>
                <a className={className} href={item.href}>
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>

        <AgentOnboardMenu />
      </div>
    </nav>
  );
}

function AgentOnboardMenu() {
  const [copyState, setCopyState] = useState<CopyState>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!copyState) {
      return;
    }

    const timeout = window.setTimeout(() => setCopyState(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const copyPrompt = async (option: (typeof PROMPT_OPTIONS)[number]) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(option.prompt);
      setCopyState(option.role);
      setOpen(false);
    } catch {
      setCopyState("failed");
      setOpen(true);
    }
  };

  return (
    <div className="siteNavCtaWrap" ref={menuRef}>
      <button
        aria-controls="agent-onboard-menu"
        aria-expanded={open}
        aria-haspopup="true"
        className="siteNavCta"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>Onboard Agent</span>
        <span aria-hidden="true" className={`siteNavCtaChevron${open ? " open" : ""}`} />
      </button>

      {open ? (
        <div
          aria-label="Agent onboarding prompts"
          className="agentOnboardMenu"
          id="agent-onboard-menu"
        >
          {PROMPT_OPTIONS.map((option) => (
            <button
              aria-label={option.label}
              className="agentOnboardOption"
              key={option.role}
              onClick={() => void copyPrompt(option)}
              type="button"
            >
              <span>{copyState === option.role ? "Copied" : option.label}</span>
              <span className="agentOnboardOptionMeta">{option.subtitle}</span>
            </button>
          ))}
          {copyState === "failed" ? (
            <div className="agentOnboardStatus" role="status">
              Copy failed
            </div>
          ) : null}
        </div>
      ) : null}

      {copyState && copyState !== "failed" && !open ? (
        <span className="agentOnboardCopied" role="status">
          Copied
        </span>
      ) : null}
    </div>
  );
}
