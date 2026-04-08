const skeletonFiles = [
  "app/api/v1/sellers/*",
  "app/api/v1/jobs/*",
  "lib/env.ts",
  "lib/errors.ts",
  "lib/fingerprint.ts",
  "lib/supabase.ts",
  "lib/redis.ts",
  "supabase/migrations/20260408_000001_init_mvp.sql"
];

const docs = [
  {
    title: "Technical Spec",
    description: "Authoritative product and protocol specification.",
    path: "docs/project/PieBazaar - QuotaDEX 技术规格说明书 v3.0 (Final).md"
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
  }
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">QuotaDEX</p>
        <h1>A gateway skeleton for the MVP marketplace.</h1>
        <p className="lead">
          This repository now contains the first-stage project skeleton for the
          Gateway, shared libraries, and Supabase schema. The business flow is
          still document-first, but the code layout is ready for Phase 0 and
          Phase 1 implementation work.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Current Focus</h2>
          <ul>
            <li>Set up the Next.js gateway application.</li>
            <li>Define shared env, Redis, Supabase, and fingerprint helpers.</li>
            <li>Create API route placeholders for seller and job workflows.</li>
            <li>Land the first Supabase migration for sellers, jobs, and events.</li>
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
