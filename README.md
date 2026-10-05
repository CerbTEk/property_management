# Treestand Manager — CerbTek LLC

Standalone React/Vite application following Kairo's frontend structure, with a public product homepage and a Supabase-authenticated `/app/` host workspace. Separate project; no Kairo source, backend keys, guest records or provider credentials are copied.

## Implemented
Public pilot-status homepage; host sign-in/sign-up; empty, user-owned listing workspaces; monthly booking calendar, manual reservations and cancellation; editable base pricing, per-date rates and accommodation estimates; message drafts; connection status; workspace JSON backup. Postgres enforces listing ownership, occupancy, minimum stay and atomic overlapping-booking exclusion. Back-to-back stays are allowed.

## Local build
`npm ci`, `npm test`, `npm run build`. `npm run dev` starts Vite. Copy `.env.example` to `.env.local` and set only the dedicated Supabase URL and publishable key. Service-role/secret keys never belong in frontend configuration. The public homepage renders without backend configuration; host sign-in is explicitly unavailable until configured.

## Deployment prerequisites
Create a dedicated `CerbTEk/treestand-manager` repository, then push this source including package-lock.json. The GitHub connector currently available can read/write existing repositories but does not expose repository creation. No Treestand repository was found. Do not place this project in the Kairo repository.

Provision a dedicated Supabase project after organization/cost approval. Apply `database/schema.sql` once to that clean project and run database advisors and the included isolation tests. This SQL is a schema draft, not an applied migration. Configure email confirmation, Site URL and allowed redirects to the chosen app URL. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY during the build. No existing Sites data is automatically imported; plan and validate an owner-scoped import separately.

Webflow Cloud deployment must use a supported static/Vite build path with output `dist` and SPA routing for `/app/`. Confirm configuration against current Cloud documentation before deployment. Set APP_BASE_PATH at build time for mounted deployments. Kairo's existing Webflow app and project are unchanged.

## Integrations and release status
Hospitable Connect application submitted October 5, 2026, with logo hosting disclosed as pending. Review may take up to five business days; submission is not approval. Requested bookings, calendar pricing/availability and templated messaging require confirmed commercial terms and credentials. WelcomeScreen and TTLock remain disconnected. No guest messages, price changes, passcodes or unlock requests are sent. Runtime provider credentials will require a server-side integration worker; this browser frontend does not store them.

Before commercial onboarding: organization/staff permissions, provider OAuth and revocation, webhook validation/idempotency, retries/reconciliation, timed guest-code lifecycle, billing, notifications and live pilot testing are required. Keep Uplisting active until validated migration. This is a buildable application foundation, not a production-ready replacement.
