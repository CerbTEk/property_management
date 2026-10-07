# Staff invitation and work-reminder email

`treestand-staff-mail` authenticates verified users with getUser/getClaims and the existing owner MFA/pilot rules. Only explicit host requests can prepare an owned pending invitation or open task reminder. Task emails require accepted active staff access, a verified destination and that recipient's email preference. The request accepts a kind/reference ID, never an arbitrary destination, body or sender. Fixed plain-text messages link to the staff workspace and contain no guest data or access credentials.

Private durable email jobs deduplicate invitation IDs or task revisions. A service-only claim leases a ready job, rechecks invitation/assignment/consent/cancellation and suppressions, and checkpoints sending before the external request. The adapter uses the fixed Resend HTTPS endpoint, no redirects, a 15-second timeout and the job ID as a stable idempotency key. Provider acceptance is distinct from delivery. Errors or expired in-flight leases with uncertain outcomes become unknown and are never blindly retried. Permanent provider rejection is failed; resending needs a separately reviewed new job/version, not an automatic retry.

`treestand-staff-mail-webhook` verifies the exact raw body, Svix HMAC signature and five-minute timestamp window before accepting delivered/bounced/complained events. Private event IDs deduplicate receipts. Early receipts are reconciled when acceptance is saved. Bounce and complaint states cannot be overwritten by a later delivered event, and both suppress future email to the recipient. No opens/clicks are tracked. Sender activation requires webhook setup so provider acceptance is not portrayed as completed delivery.

Server secrets/configuration:

- RESEND_API_KEY: dedicated send key, stored server-side.
- TREESTAND_EMAIL_FROM: a verified Treestand/CerbTek sender.
- TREESTAND_EMAIL_WEBHOOK_SECRET: signing secret for this endpoint.
- TREESTAND_EMAIL_ENABLED=true: explicit activation only after sender, webhook and designated test validation.

Webhook endpoint: https://pjeejfntvtbqbsuxcwds.supabase.co/functions/v1/treestand-staff-mail-webhook. Subscribe to email.delivered, email.bounced and email.complained. The webhook is not registered in Resend yet, and no sending configuration is activated by deployment. Existing other-product email domains/credentials are not repurposed.

Without all configuration values, status and send requests report setup_required, no job is prepared by the endpoint, and UI send buttons remain disabled. In-app invitations and staff task access work independently via the shared /staff/ link. Host invitation/reminder buttons send or retrieve the state of the same immutable job; they do not automatically flush a backlog. No automatic daily digests or SMS sending are configured. Unknown sends require provider-log reconciliation before any replacement request.

Tests use synthetic payloads/providers only. No real invitations or emails are sent during development or deployment.

Primary implementation references: https://www.svix.com/guides/receiving/receive-webhooks-with-go/ and https://resend.com/changelog/idempotency-keys.
