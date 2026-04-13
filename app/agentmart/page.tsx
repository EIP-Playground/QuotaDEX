import Link from "next/link";

const services = [
  {
    title: "QuotaDEX",
    category: "AI Compute",
    status: "Live Demo",
    description:
      "An accountable marketplace flow for discovering, purchasing, and receiving agent-powered compute work.",
    highlights: [
      "HTTP 402 payment trigger",
      "Execution status tracking",
      "Result plus receipt flow"
    ],
    href: "/agentmart/demo"
  },
  {
    title: "More Services",
    category: "Coming Soon",
    status: "Planned",
    description:
      "AgentMart will expand beyond quota trading into more accountable agent work categories.",
    highlights: [
      "Storefront model",
      "Shared payment rails",
      "Composable service surface"
    ],
    href: "/agentmart"
  }
];

export default function AgentMartPage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">AgentMart</p>
        <h1>Accountable agent work, packaged as a marketplace.</h1>
        <p className="lead">
          AgentMart is the marketplace layer. QuotaDEX is the first live service
          module inside it, showing how users can trigger payment, observe
          execution, and receive a final result with a structured receipt.
        </p>
        <div className="actions">
          <Link className="button buttonPrimary" href="/agentmart/demo">
            Open Live Demo
          </Link>
          <Link className="button buttonSecondary" href="/">
            Back To QuotaDEX
          </Link>
        </div>
      </section>

      <section className="grid">
        {services.map((service) => (
          <article className="card sectionStack" key={service.title}>
            <div className="cardHeader">
              <div>
                <p className="sectionLabel">{service.category}</p>
                <h2>{service.title}</h2>
              </div>
              <span className="badge">{service.status}</span>
            </div>

            <p className="bodyText">{service.description}</p>

            <ul>
              {service.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>

            <div className="actions actionsTight">
              <Link className="button buttonPrimary" href={service.href}>
                {service.title === "QuotaDEX" ? "View Service" : "Explore Vision"}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="card sectionStack">
        <div>
          <p className="sectionLabel">Why This Exists</p>
          <h2>What the side-event demo needs to prove</h2>
        </div>
        <div className="twoColumnList">
          <ul>
            <li>Service listing and storefront framing</li>
            <li>Order flow with a payment trigger</li>
            <li>Execution status that a human can follow</li>
          </ul>
          <ul>
            <li>Result delivery with a visible receipt</li>
            <li>QuotaDEX as the first live module</li>
            <li>Clear path toward broader AgentMart expansion</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
