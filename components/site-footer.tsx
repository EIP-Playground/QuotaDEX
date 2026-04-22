import React from "react";
import Image from "next/image";

const COLS = [
  { title: "Product", links: ["Marketplace", "Sellers", "Pricing"] },
  { title: "Developers", links: ["Gateway API", "Escrow Contract", "SDK", "GitHub"] },
  { title: "Ecosystem", links: ["Kite AI", "Pieverse", "Agent Passport", "AgentBazaar"] }
];

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="siteFooterInner">
        <div className="siteFooterTop">
          <div className="siteFooterBrand">
            <div className="siteLogo" style={{ fontSize: 17 }}>
              <Image
                alt="QuotaDEX logo"
                className="siteLogoImage"
                height={40}
                src="/QuotaDEX-logo.png"
                width={40}
              />
              <span className="siteLogoText">QuotaDEX</span>
            </div>
            <p>Agent-to-Agent secondary market for AI compute. Built on Kite.</p>
          </div>

          <div className="siteFooterCols">
            {COLS.map((col) => (
              <div className="siteFooterCol" key={col.title}>
                <h4>{col.title}</h4>
                <ul>
                  {col.links.map((label) => (
                    <li key={label}>
                      <a>{label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="siteFooterBot">
          <p>© 2026 QuotaDEX · AgentBazaar. All rights reserved.</p>
          <p>Privacy · Terms · Status</p>
        </div>
      </div>
    </footer>
  );
}
