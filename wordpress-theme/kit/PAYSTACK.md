# Taking payments with Paystack

PlatePilot collects through one Paystack account (the platform's) and settles
each vendor from that account. Other providers stay available; Paystack is the
one wired for launch, and the fee per order is already recorded so per-vendor
payouts can be switched on later without changing the orders.

## 1. Currency check — read this first

Paystack processes **NGN, USD, GHS, ZAR and KES** only (their API reference).
Amounts are sent in each currency's subunit, which is what PlatePilot stores.

**XAF, XOF and the other CFA francs are not supported.** If the restaurant's
currency is XAF the checkout refuses with

```
PAYSTACK_CURRENCY_UNSUPPORTED:XAF:NGN/USD/GHS/ZAR/KES
```

before anything is sent to Paystack. Three honest options:

| Situation | What to do |
| --- | --- |
| Business is registered in Nigeria, Ghana, South Africa or Kenya | Price the menu in that local currency (NGN, GHS, ZAR, KES) — Paystack settles to you there |
| Business can take USD settlement | Price in USD; guests pay by card in USD |
| Everything is in CFA francs | Paystack is the wrong provider — use Flutterwave, CamPay, NotchPay or a mobile-money gateway, and keep PlatePilot for ordering |

Changing a location's currency is a settings change, not a migration: the money
is stored in minor units with the currency code beside it.

## 2. Keys

Paystack dashboard → **Settings → API Keys & Webhooks**.

| Setting | Value |
| --- | --- |
| Secret key | `sk_test_…` or `sk_live_…` |
| Public key | `pk_test_…` or `pk_live_…` |

The secret is referenced from the environment, never stored in a database row:

```
PAYSTACK_TEST_SECRET_KEY=sk_test_...
PAYSTACK_LIVE_SECRET_KEY=sk_live_...
```

A `payment_connections` row per location stores the *reference*
(`env:PAYSTACK_LIVE_SECRET_KEY`), not the key itself. Test and live keys
cannot be mixed: the integration refuses a key whose prefix does not match the
connection's environment.

On Cloudflare, add both as **secrets** (Workers → platepilot → Settings →
Variables and Secrets). In WordPress, the PlatePilot settings screen keeps the
publishable key for display and the secret for the connection check only —
charging happens in the app.

## 3. Webhook

Paystack dashboard → **Settings → API Keys & Webhooks → Webhook URL**:

```
https://platepilot.<your-subdomain>.workers.dev/api/webhooks/paystack
```

What happens on every callback:

1. The raw body is read and capped at 1 MB.
2. `x-paystack-signature` is verified as HMAC-SHA512 of the raw bytes with the
   secret key — a forged or re-signed body is rejected with `401`.
3. The event is written to `payment_events` before any work; a duplicate event
   id is acknowledged and ignored (Paystack retries often).
4. The transaction is **verified independently** against Paystack's API and must
   match reference, amount and currency, in the same environment.
5. Only then is the order marked paid.

A browser redirect never marks an order paid.

## 4. Settling vendors

Because money lands in one account, the operator owes each vendor their share.
Ask the database:

```sql
select app_platform_revenue(now() - interval '30 days', now());
select app_vendor_settlement(now() - interval '30 days', now());
```

`app_vendor_settlement` returns, per vendor and per currency: orders, gross,
collected, refunded, platform fee, and **net payable**. Only paid money counts —
cash orders at the counter carry no fee and are not "payable" — and refunds
return the fee with the money. Both functions throw `FORBIDDEN` for anyone who
is not a platform admin.

Make yourself the operator once (service role / SQL editor):

```sql
insert into platform_admins(user_id) values ('<your auth user id>');
select app_set_commission('<organization id>', 200);  -- 2.00%
```

Commission is basis points, 0–3000. Vendors cannot change their own rate: the
column is revoked from `authenticated` and `app_set_commission` refuses them.

## 5. When more vendors arrive

The per-order fee (`orders.platform_fee_minor`) is the split point. Switching to
real per-vendor payouts means one of:

- **Paystack subaccounts** — create a subaccount per vendor, then send
  `subaccount` and `transaction_charge`/`bearer` on initialize. PlatePilot's
  `platform_fee_minor` maps directly onto the split.
- **Stripe Connect** — `application_fee_amount` + `transfer_data.destination`.

Until then, `app_vendor_settlement` *is* the settlement method: run it, pay each
vendor the net payable, keep the fee.
