# Security and privacy model

PlatePilot uses tenant IDs in database keys and RLS policies, not UI filters, for isolation. Staff mutations require membership and location permission. Service-role credentials are server-only; private jobs, provider receipts and outbox records are revoked from browser roles. Security-definer functions use fixed search paths and explicit grants.

A Google Place ID identifies a public branch only. It does not prove ownership, grant tenant access, authorize payouts or permit storefront overwrite. Raw listing responses are transient and must not enter logs, analytics, CDN caches or Postgres. Persist only the selected Place ID and required attribution in the interface.

Payment attempts snapshot tenant, location, order, amount, currency, provider, merchant connection and test/live environment before provider contact. Amounts use integer minor units internally and decimal strings at JSON boundaries. Browser redirects never pay an order. Paystack requires raw-body HMAC plus independent transaction verification; Stripe and PayPal must confirm cleared payment/capture with the official provider path. A verified payment, outbox event and one kitchen ticket commit atomically. Duplicate success enters review.

Use hosted checkout. Never collect card numbers or CVV. Refunds use the original charge currency and refundable limit. Ambiguous money-moving calls require reconciliation, not blind retry. Production messaging and campaigns default off; transactional and marketing consent remain separate.

Log opaque references only. Redact tokens, secrets, personal data and payment payloads. Define retention with the merchant: delete expired guest tracking tokens, anonymize closed customer records subject to legal holds, and retain financial ledgers as required by local law. Access, export and deletion requests require identity verification and an audit event.

Before launch, review country-specific tax, privacy, fiscal receipt, accessibility and consumer requirements. No global fiscal certification is claimed. Perform two-tenant RLS/API/storage tests, backup restore drills and incident-response exercises with authorized accounts.
