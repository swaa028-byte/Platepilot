# Operations handbook

## Start and close a shift

Confirm the correct location, currency and test/live environment. Open a cash shift with a counted opening amount. Take orders only from the published menu; investigate unavailable items instead of editing prices in the browser. Kitchen staff advance tickets through new, preparing, ready and served. At close, compare expected and counted cash, record variance and export currency-separated payment and settlement reports.

## Payments

Hosted checkout success pages are informational. Reconcile from verified provider events and transaction queries. `reconciliation_required` means the provider outcome is ambiguous: inspect the existing attempt and provider dashboard before any new attempt. A duplicate success enters the refund/review queue and must not create another ticket. Refunds remain `requested` until the provider confirms them.

## Network loss

Keep safe cart drafts and show connectivity state. Reconnect KDS through realtime or polling. Do not replay payment initialization or refunds automatically, and do not claim offline card processing. Browser print is the supported initial receipt path; thermal printer support requires selected-hardware verification.

## Jobs and incidents

The durable worker leases jobs with bounded retries. Unknown job kinds deliberately retry and dead-letter rather than faking an external effect. Inspect `last_error`, job age and provider status; resolve the cause before replaying. Suspend affected ordering if payment verification is unavailable. For suspected isolation or credential exposure, disable affected connections, rotate secrets through the secret manager, preserve audit records and follow the incident runbook.

## Backups and retention

Schedule Supabase point-in-time recovery where available and regular encrypted exports. Test restore into an isolated project. Apply documented retention to guest tokens, customer profiles, provider receipts and integration logs while preserving legally required financial records.
