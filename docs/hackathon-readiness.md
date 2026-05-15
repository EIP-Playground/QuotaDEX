# QuotaDEX Hackathon Readiness

> Updated: 2026-05-15
> Scope: PR #4 through PR #16, plus public production checks against `https://quota-dex.vercel.app`.

## Current Demo Routes

| Route | Purpose | Status |
| --- | --- | --- |
| `https://quota-dex.vercel.app` | Public product entry | Live on Vercel |
| `https://quota-dex.vercel.app/demo` | One-click Kite Testnet settlement demo with Test USDT | Ready; keep demo wallets funded |
| `https://quota-dex.vercel.app/marketplace` | Demo/Live dashboard with sellers, activity, settlements, and Kitescan links | Ready |
| `skills/quotadex-buyer/SKILL.md` | Reproducible Buyer Agent workflow for capability discovery, quote, x402 payment, direct fallback, and polling | Ready |
| `skills/quotadex-seller/SKILL.md` | Reproducible Seller Agent workflow for Passport setup, bond proof, session renewal, heartbeat, polling, and job callbacks | Ready |

## Requirement Coverage

| Requirement | Status | Evidence in QuotaDEX |
| --- | --- | --- |
| Shows an AI agent that performs a task and settles on Kite chain | Met | Buyer/Seller Agent Skills define the autonomous flow. `/demo` runs quote, payment, escrow registration, seller completion, and `Escrow.release`. |
| Executes paid actions | Met | Primary path is `X-PAYMENT -> Pieverse verify/settle -> QuotaDEXEscrow.registerFacilitatorPayment`. Direct escrow tx-hash fallback is guarded by explicit env flags. |
| Works end-to-end in a live demo in production | Met for Demo Testnet; conditional for Live Mainnet | Vercel production app responds publicly. Live Mainnet requires at least one online seller for the selected exact capability. |
| Uses Kite chain for attestations | Met | Escrow registration, settlement, release/refund, seller addresses, and tx hashes are surfaced through Kitescan links on Live Dashboard. |
| Functional UI required | Met | `/marketplace` provides Demo/Live profile switching, persisted selection, live seller status, top sellers, recent settlements, and event history. `/demo` provides a controlled E2E flow. |
| Publicly accessible or reproducible via README | Met | README links production app, demo, dashboard, skills, scripts, env setup, and local commands. |

## Judging Criteria Notes

| Criterion | Current strength | What to tighten before judging |
| --- | --- | --- |
| Agent Autonomy | Buyer Agent discovers exact capabilities, requests quote, pays, verifies, and polls. Seller Agent registers, renews sessions, heartbeats, polls, executes, and reports completion/failure. | Keep the live seller process running in the foreground during demo; prepare one exact capability value with an online seller. |
| Developer Experience | English/Chinese READMEs, Agent Skills, local scripts, and API reference cover the full path. | Record a short video walkthrough and keep the public README as the single entry point for judges. |
| Real-World Applicability | Solves burst AI compute procurement without API keys or human checkout; runs on production Vercel with Supabase/Redis/Kite. | If judging emphasizes real mainnet settlement, confirm `LIVE_MAINNET_ESCROW_CONTRACT_ADDRESS` and seller inventory are configured before the demo window. |
| Novel / Creative | Combines x402, Kite Passport, seller bond proofs, escrow release/refund, capability discovery, and Kitescan audit links into an A2A marketplace. | Emphasize that Dashboard is observability, while Buyer Agent inventory comes from `/api/v1/buyers/capabilities`. |

## Final Demo Checklist

- Keep `BUYER_PRIVATE_KEY`, `DEMO_SELLER_PRIVATE_KEY`, and `GATEWAY_PRIVATE_KEY` funded for the Kite Testnet demo.
- Keep `ALLOW_MOCK_PAYMENTS=false` in production except for intentionally local-only development.
- If using Live Mainnet, deploy/configure `QuotaDEXEscrow(gateway, USDC.e)`, set `LIVE_MAINNET_ESCROW_CONTRACT_ADDRESS`, and keep a Seller Agent online.
- Verify `/api/v1/buyers/capabilities?network_profile=live-mainnet` returns the exact capability you plan to buy.
- Open the Live Dashboard after a settlement and show Kitescan links for the seller address and settlement transaction.
- Have `skills/quotadex-buyer/SKILL.md` and `skills/quotadex-seller/SKILL.md` ready as the reproducible agent workflow.
