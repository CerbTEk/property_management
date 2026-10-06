# Treestand payments

Approved model: CerbTek earns a software subscription only. Booking commission is zero. Independent hosts own guest payment relationships, processing fees, stay refunds and disputes. Airbnb retains checkout and payouts for its reservations. There is no Treestand transfer, pooled balance, escrow or host payout engine.

## Integration implemented

The host Payments blade calls authenticated `treestand-payments`. The server resolves the account from the verified Supabase user; caller-supplied Stripe account IDs, prices, amounts, URLs and owners are rejected. Existing MFA enforcement and the authorized pilot exception are retained. Accounts v2 uses `dashboard: full`, `fees_collector: stripe`, `losses_collector: stripe`, Merchant card payments plus Customer configuration. Stripe handles unresolved negative balance liability under this configuration; hosts still fund their refunds and disputes. Embedded onboarding, notification banner, account management, payments/refunds/disputes and payouts use owner-scoped short-lived Account Sessions. A full Dashboard link is also provided.

Subscription Checkout charges the account's Customer configuration via `customer_account` on CerbTek's platform account. Prices are server allowlisted, positive USD flat recurring monthly/yearly Prices. The browser cannot choose arbitrary products, quantities or discounts. The current implementation is one subscription per host; per-listing/tier pricing requires an explicitly approved catalog and quantity rule before enabling checkout. Subscription management uses CerbTek's Customer Portal.

Server-only RLS tables track mappings, subscriptions and processed event IDs. A per-host/environment lease serializes mutations. Stable persisted idempotency keys protect account and checkout creation against concurrent clicks and lost writes; unresolved writes older than 23 hours need manual reconciliation, because Stripe can prune idempotency keys after 24 hours. Open checkouts are reused; a live or pending subscription prevents another checkout. Current Stripe subscription objects are retrieved for webhooks rather than trusting event order or metadata. Failed reconciliation returns 500 for Stripe retries; completed event IDs are recorded only after saving. Connected-account guest events cannot alter platform subscriptions. Return URLs never activate access.

The existing pilot is not paywalled. Verified subscription snapshots are prepared for a future entitlement policy; enforcement and grace periods must be chosen before commercial launch. No live financial operation has been validated yet. Direct guest booking checkout is intentionally unavailable until immutable reservation quotes, refunds/reconciliation and property tax responsibility are implemented and validated. Connecting Stripe is not proof that direct booking payments or payouts are operational.

## Configuration and account boundary

Use a dedicated Treestand/CerbTek Stripe account and separate development sandbox. Do not reuse ForgeCIF's account configuration or product catalog without the owner's explicit choice. Add only a restricted server key with the minimum permissions needed for Accounts v2, Account Sessions, Prices, Subscriptions, Checkout Sessions, Customer Portal, platform identity retrieval, and Tax Registrations (only when tax mode needs it). Store keys in Supabase Edge Function Secrets, never frontend variables or source files.

Set these secrets on the PMS Supabase project:

| Name | Value |
| --- | --- |
| `TREESTAND_STRIPE_MODE` | `sandbox` initially; `live` only after validation |
| `TREESTAND_STRIPE_ACCOUNT_ID` | Verified platform account ID |
| `TREESTAND_STRIPE_API_KEY` | Restricted key for the chosen environment |
| `TREESTAND_STRIPE_PUBLISHABLE_KEY` | Matching publishable key |
| `TREESTAND_APP_ORIGIN` | Current HTTPS origin; update to permanent domain at launch |
| `TREESTAND_STRIPE_MONTHLY_PRICE` | Approved recurring monthly Price ID |
| `TREESTAND_STRIPE_ANNUAL_PRICE` | Approved recurring annual Price ID |
| `TREESTAND_STRIPE_WEBHOOK_SECRET` | Signing secret of the platform Billing endpoint |
| `TREESTAND_STRIPE_BILLING_ENABLED` | Keep unset/false until prices and tax treatment are approved |
| `TREESTAND_STRIPE_SUBSCRIPTION_TAX_MODE` | Unset until review; `reviewed_no_tax` or `registered_automatic` |

Register the platform snapshot webhook URL `https://pjeejfntvtbqbsuxcwds.supabase.co/functions/v1/treestand-stripe-webhook`, API version `2026-08-26.dahlia`, for `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`. The function verifies raw-body Stripe signatures with a 300-second timestamp tolerance; gateway JWT verification is disabled only because Stripe signatures authenticate every accepted event. The host API independently verifies Supabase identity and MFA. Subscription and checkout events are platform-only; no all-connected-accounts webhook is needed for current Billing reconciliation.

Enable Connect on the chosen Stripe platform account using its SaaS configuration. Configure CerbTek's Customer Portal with payment method updates, invoice history, and cancellation at period end; choose monthly/annual switching once the approved catalog exists. Do not activate a recurring Price until the owner chooses its amount. Current user choice is to choose prices after this build. Do not invent a $0 trial or paid plan.

## Tax and launch verification

Tax classification remains a legal/CPA decision. A direct charge does not by itself resolve NC accommodation-facilitator liability. Stripe Tax does not by itself register a business or file/remit all lodging taxes. No lodging tax rate is hardcoded here. Subscription tax collection stays disabled until reviewed; automatic collection additionally checks for active Stripe registrations. Registration entries must correspond to real government registrations. The `reviewed_no_tax` mode must not be used as a blanket exemption for all jurisdictions.

Validate sandbox host onboarding (including requirements changes), distinct-owner denial, monthly/annual checkout, abandoned checkout, duplicate clicks, renewals, failed payments, cancellation, duplicate/reordered events, invalid signatures, mode/account mismatches and recovery. Validate the physical payment account and payout schedule in Stripe before any live guest payment. Update the permanent site domain, origin, Stripe business website and allowed redirects together. Tests cover core safeguards using synthetic objects and a local database; these do not replace end-to-end Stripe sandbox validation.
