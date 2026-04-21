"use client";

import React, { useEffect, useState } from "react";

type TermColor = "tg" | "tc" | "tm" | "tp";

type TermLine =
  | { text: string; c?: TermColor; p?: number; ascii?: false }
  | { ascii: true; text?: undefined; c?: undefined; p?: undefined };

type RenderedLine =
  | { ascii: true }
  | { ascii?: false; c?: TermColor; r: string };

const TERM_LINES: TermLine[] = [
  { text: '$ quotadex quote --cap gpt-4o --prompt "summarize"', c: "tg", p: 400 },
  { ascii: true },
  { text: "  QuotaDEX CLI · Kite A2A Gateway", c: "tm", p: 250 },
  { text: "-------------------------------------------", c: "tm" },
  { text: "Agent-to-Agent secondary market for compute", c: "tp" },
  { text: "-------------------------------------------", c: "tm", p: 350 },
  { text: "✓ Seller reserved · fingerprint=0xa4f2…", c: "tc" },
  { text: "✓ x402 Payment Required · payment_id set", c: "tc" },
  { text: "✓ Escrow.deposit confirmed on Kite", c: "tc", p: 500 },
  { text: "Next:", c: "tp" },
  { text: "  → POST /api/v1/jobs/verify", c: "tm" },
  { text: "  → agent: assign → start → complete", c: "tm" },
  { text: "  → Escrow.release(payment_id)", c: "tm" }
];

const ASCII_LOGO = `╔═══════════════════════╗
║   Q U O T A D E X     ║
║   Kite · A2A Gateway  ║
╚═══════════════════════╝`;

export function Terminal() {
  const [lines, setLines] = useState<RenderedLine[]>([]);
  const [li, setLi] = useState(0);
  const [ci, setCi] = useState(0);

  useEffect(() => {
    if (li >= TERM_LINES.length) {
      const t = window.setTimeout(() => {
        setLines([]);
        setLi(0);
        setCi(0);
      }, 4500);
      return () => window.clearTimeout(t);
    }

    const cur = TERM_LINES[li];

    if (cur.ascii) {
      setLines((prev) => [...prev, { ascii: true }]);
      const t = window.setTimeout(() => setLi((n) => n + 1), 250);
      return () => window.clearTimeout(t);
    }

    if (ci < cur.text.length) {
      const t = window.setTimeout(
        () => {
          setLines((prev) => {
            const next = [...prev];
            next[li] = { c: cur.c, r: cur.text.slice(0, ci + 1) };
            return next;
          });
          setCi((n) => n + 1);
        },
        15 + Math.random() * 18
      );
      return () => window.clearTimeout(t);
    }

    const t = window.setTimeout(
      () => {
        setLi((n) => n + 1);
        setCi(0);
      },
      cur.p ?? 60
    );
    return () => window.clearTimeout(t);
  }, [ci, li]);

  return (
    <div className="landingTerminal" aria-hidden="true">
      <div className="landingTerminalDots">
        <div className="landingTerminalDot landingTerminalDotAccent" />
        <div className="landingTerminalDot" />
        <div className="landingTerminalDot" />
      </div>
      {lines.map((line, i) => {
        if (line.ascii) {
          return (
            <pre key={`ascii-${i}`} className="landingTerminalAscii">
              {ASCII_LOGO}
            </pre>
          );
        }
        const colorClass = line.c ? ` ${line.c}` : "";
        const isLast = i === lines.length - 1;
        return (
          <div key={`ln-${i}`} className={`landingTerminalLine${colorClass}`}>
            {line.r}
            {isLast && <span className="landingTerminalCursor" />}
          </div>
        );
      })}
    </div>
  );
}
