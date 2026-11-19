# Integration and verification matrix

| Integration | Implemented locally | Required verification | Current state |
| --- | --- | --- | --- |
| Google Places (New) | Authenticated, rate-limited Text Search; minimal fields; transient response; Place ID link | Restricted billing-enabled server key, correct branch, attribution and storage inspection | BLOCKED — no key supplied |
| Paystack | Attempt persistence, hosted initialization, HMAC, independent verify, atomic application | Authorized test key, webhook delivery, duplicate/timeout/refund scenarios | BLOCKED — no sandbox credentials |
| Stripe | Official SDK client and Checkout/payment-intent state helper | Test account, signed webhook endpoint, delayed methods and refunds | BLOCKED — callback fails closed; no credentials |
| PayPal | Capture verification helper with order/money matching | Sandbox OAuth, webhook signature verification, capture and refund flows | BLOCKED — callback fails closed; no credentials |
| CSV | Merchant menu validation and preview; operations export foundation | Real merchant file and approval | AVAILABLE without partner access |
| Supabase Auth/Postgres/RLS | Schema, policies, RPC transactions and embedded migration checks | Local/hosted project, two-tenant SQL/API/storage tests | BLOCKED — no service configured |
| Email / WhatsApp | Provider-neutral job and consent foundations | Authorized sender, template approval, opt-out and spending controls | BLOCKED — production campaigns off |
| Xero / Sage / QuickBooks | No private API invented; CSV fallback | Access, accounting mapping and country coverage | BLOCKED |
| Local POS / thermal printers / terminals | Browser print and external-payment recording foundations | Selected hardware and merchant approval | BLOCKED |
| Uber Eats / Mr D / couriers | Manual dispatch fallback | Partner access, signed API contracts and coverage | BLOCKED |

Contract fixtures are not PROVIDER VERIFIED. Keep sandbox and live transactions separate and exclude test activity from live dashboards.
