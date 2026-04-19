import React from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/#marketplace", label: "Marketplace" },
  { href: "/#gateway", label: "Gateway" },
  { href: "/#monitor", label: "Monitor" },
  { href: "/#ecosystem", label: "Ecosystem" }
];

type SiteHeaderProps = {
  current: "landing" | "dashboard";
};

export function SiteHeader({ current }: SiteHeaderProps) {
  return (
    <header className={`siteHeader siteHeader${current}`}>
      <div className="siteHeaderInner">
        <Link className="siteBrand" href="/">
          <span className="siteBrandMark">Q</span>
          <span className="siteBrandTextWrap">
            <strong className="siteBrandText">QuotaDEX</strong>
            <span className="siteBrandSub">Accountable compute market</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="siteNav">
          {NAV_ITEMS.map((item) => (
            <Link className="siteNavLink" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <Link className="siteHeaderCta" href="/dashboard">
          Start Selling Compute
        </Link>
      </div>
    </header>
  );
}
