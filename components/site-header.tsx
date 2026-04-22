"use client";

import React, { useEffect, useState } from "react";
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

        <Link className="siteNavCta" href="/marketplace">
          Start Selling Compute ↗
        </Link>
      </div>
    </nav>
  );
}
