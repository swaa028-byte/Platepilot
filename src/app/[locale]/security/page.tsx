import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security model",
  description: "How PlatePilot isolates tenant data, handles payments, and treats personal data.",
};

/**
 * The security and privacy model, readable inside the product.
 *
 * The landing page used to link to a markdown file in the private repository,
 * which visitors could not open. This page states the same commitments as
 * plain HTML any visitor — or auditor — can read.
 */
const sections: { title: string; points: string[] }[] = [
  {
    title: "Tenant isolation",
    points: [
      "Every table carries a tenant ID enforced by Postgres row-level security — isolation lives in the database, not in the user interface.",
      "Staff actions require verified membership and a location-level permission; the browser never decides who may act.",
      "Service-role credentials exist only on the server. Private jobs, provider receipts and outbox records are revoked from browser roles.",
      "Database functions that touch sensitive data run with fixed search paths and explicit grants.",
    ],
  },
  {
    title: "Payments",
    points: [
      "Every payment attempt snapshots tenant, location, order, amount, currency, provider and test/live environment before the provider is contacted.",
      "Amounts are integer minor units internally; decimal strings only at JSON boundaries.",
      "Browser redirects never pay an order. Paystack requires raw-body HMAC verification plus an independent transaction check; Stripe and PayPal must confirm cleared payment or capture through their official APIs.",
      "A verified payment, its outbox event and the kitchen ticket commit atomically. Duplicate success messages go to review instead of double-charging.",
      "Card numbers and CVV are never collected — hosted checkout only. Refunds always use the original charge currency.",
    ],
  },
  {
    title: "Google listings",
    points: [
      "A Google Place ID identifies a public branch. It does not prove ownership, grant tenant access or permit overwriting a storefront.",
      "Raw listing responses are transient: they never enter logs, analytics, CDN caches or the database. Only the selected Place ID and required attribution are stored.",
    ],
  },
  {
    title: "Messaging and consent",
    points: [
      "Production messaging and marketing campaigns default to off.",
      "Transactional notifications (your order) and marketing messages use separate consent, and either can be withdrawn without affecting the other.",
    ],
  },
  {
    title: "Personal data",
    points: [
      "Logs carry opaque references only — tokens, secrets, personal data and payment payloads are redacted.",
      "Retention is agreed with the merchant: expired guest tracking tokens are deleted, closed customer records are anonymized subject to legal holds, and financial ledgers are kept as local law requires.",
      "Access, export and deletion requests require identity verification and leave an audit event.",
    ],
  },
  {
    title: "Before launch",
    points: [
      "Country-specific tax, privacy, fiscal receipt, accessibility and consumer rules are reviewed per deployment — no global fiscal certification is claimed.",
      "Every deployment gets two-tenant isolation tests, backup-restore drills and an incident-response exercise with authorized accounts.",
    ],
  },
];

export default function SecurityPage() {
  return (
    <div className="security-page">
      <div className="shell security-layout">
        <aside className="security-index">
          <p className="security-index__label">On this page</p>
          <ol>
            {sections.map((section, index) => (
              <li key={section.title}>
                <a href={`#security-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </aside>
        <div className="security-body">
          <h1>Security and privacy model</h1>
          <p className="security-page__intro">
            How PlatePilot protects restaurant data, handles money and treats personal
            information — stated plainly, so you can hold us to it.
          </p>
          {sections.map((section, index) => (
            <section key={section.title} className="security-page__section" id={`security-${index}`}>
              <span className="security-page__no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{section.title}</h2>
                <ul>
                  {section.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
