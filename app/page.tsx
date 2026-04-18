const skeletonFiles = [
  "app/api/v1/sellers/*",
  "app/api/v1/jobs/*",
  "lib/env.ts",
  "lib/errors.ts",
  "lib/fingerprint.ts",
  "lib/chain/escrow.ts",
  "lib/supabase.ts",
  "lib/redis.ts",
  "supabase/migrations/20260408_000001_init_mvp.sql",
  "contracts/QuotaDEXEscrow.sol",
  "contracts/QuotaDEXEscrow.abi.json"
];

const docs = [
  {
    title: "Technical Spec",
    description: "Authoritative product and protocol specification.",
    path: "docs/project/QuotaDEX 技术规格说明书 v3.0 (Final).md"
  },
  {
    title: "MVP Rules",
    description: "Implementation boundaries and agreed MVP constraints.",
    path: "docs/mvp-rules(swen).md"
  },
  {
    title: "Development Order",
    description: "Recommended phase-by-phase build sequence.",
    path: "docs/development-order(swen).md"
  },
  {
    title: "Frontend Requirements",
    description: "Business-facing page requirements for QuotaDEX and future AgentBazaar integration.",
    path: "docs/frontend-requirements(swen).md"
  },
  {
    title: "Payment Migration",
    description: "Future integration plan for Pieverse Facilitator after the current Escrow-led demo loop.",
    path: "docs/payment-migration-pieverse-facilitator(swen).md"
  }
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">QuotaDEX</p>
        <h1>A gateway skeleton for the MVP marketplace.</h1>
        <p className="lead">
          QuotaDEX is the first vertical service planned for the future
          AgentBazaar marketplace. AgentBazaar is positioned as an Agent
          Marketplace that showcases the Accountable Agent Commerce Layer.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Current Focus</h2>
          <ul>
            <li>Set up the Next.js gateway application.</li>
            <li>Define shared env, Redis, Supabase, and fingerprint helpers.</li>
            <li>Keep Custom Escrow as the current primary payment route.</li>
            <li>Use Mock payment only as the stable fallback demo path.</li>
            <li>Next up: harden the demo loop, receipt view, and explorer proof.</li>
          </ul>
        </article>

        <article className="card">
          <h2>Docs To Read First</h2>
          <ul>
            {docs.map((doc) => (
              <li key={doc.path}>
                <strong>{doc.title}</strong>: {doc.description}
                <br />
                <code>{doc.path}</code>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="card">
        <h2>Skeleton Inventory</h2>
        <pre>{skeletonFiles.join("\n")}</pre>
      </section>
    </main>
  );
}
