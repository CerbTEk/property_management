# Treestand Manager — CerbTek LLC

Standalone React/Vite application following Kairo's frontend structure, with a public product homepage and a Supabase-authenticated `/app/` host workspace. Separate project; no Kairo source, backend keys, guest records or provider credentials are copied.

## Implemented
Public pilot-status homepage; host sign-in/sign-up; empty, user-owned listing workspaces; monthly booking calendar, manual reservations and cancellation; editable base pricing, per-date rates and accommodation estimates; message drafts; connection status; workspace JSON backup. Postgres enforces listing ownership, occupancy, minimum stay and atomic overlapping-booking exclusion. Back-to-back stays are allowed.

## Local build
`npm ci`, `npm test`, `npm run build`. `npm run dev` starts Vite. Copy `.env.example` to `.env.local` and set only the dedicated Supabase URL and publishable key. Service-role/secret keys never belong in frontend configuration. The public homepage renders without backend configuration; host sign-in is explicitly unavailable until configured.

## Deployment prerequisites
Source repository: `CerbTEk/property_management`. Webflow Cloud app: `treestand-manager`, mounted at `/` with continuous deployment from `main`. Public URL: https://treestand-manager.webflow.io/ . Do not place this project in the Kairo repository.

Dedicated Supabase project: `Property Management` (`pjeejfntvtbqbsuxcwds`), CerbTek organization, US East Ohio. Initial schema and extension security migrations applied October 5, 2026; all four tables have ownership RLS and no anonymous read access. Security advisors reported no findings after moving btree_gist to the extensions schema. For a new clean installation, apply `database/schema.sql` followed by `database/extension_security.sql` and run advisors. Configure Site URL to https://treestand-manager.webflow.io/ and allow https://treestand-manager.webflow.io/app/ for email confirmation. Those Auth dashboard settings still require verification. `src/public-config.js` contains only the project's intentionally public URL and publishable browser key; VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY may override them. No existing Sites data is automatically imported; plan and validate an owner-scoped import separately.

Webflow Cloud deployment must use a supported static/Vite build path with output `dist` and SPA routing for `/app/`. Confirm configuration against current Cloud documentation before deployment. Set APP_BASE_PATH at build time for mounted deployments. Kairo's existing Webflow app and project are unchanged.

## Integrations and release status
Guest Experience now includes owner-only per-listing welcome display settings, house-guide text, recommendations, host contact details and reservation-based previews. Apply `database/guest_experience.sql` when installing a fresh project; it was applied to the dedicated project October 5, 2026. TV/player pairing, public guest guidebooks, media, Wi-Fi sharing, weather, storefront and AI guest chat are not implemented. Gill confirmed successful host sign-in October 5. See [Uplisting coverage and delivery plan](docs/uplisting-parity-plan.md) for the reviewed feature inventory, implementation gaps, dependencies and cutover tests.

Hospitable Connect application submitted October 5, 2026, with logo hosting disclosed as pending. Review may take up to five business days; submission is not approval. Requested bookings, calendar pricing/availability and templated messaging require confirmed commercial terms and credentials. WelcomeScreen and TTLock remain disconnected. No guest messages, price changes, passcodes or unlock requests are sent. Runtime provider credentials will require a server-side integration worker; this browser frontend does not store them.

Before commercial onboarding: organization/staff permissions, provider OAuth and revocation, webhook validation/idempotency, retries/reconciliation, timed guest-code lifecycle, billing, notifications and live pilot testing are required. Keep Uplisting active until validated migration. This is a buildable application foundation, not a production-ready replacement.

### Browser welcome display

Guest Experience now creates private, revocable screen links for the owned browser player at `/display/`. Apply `database/display_devices.sql` after the base and guest schemas, then deploy `supabase/functions/guest-display/index.ts` with its `handler.mjs` dependency and `verify_jwt=false` (custom hashed device bearer authentication). See [setup and limitations](docs/guest-display.md).

### Android / Google TV pilot

Native TV app source and a GitHub Actions APK build are in [android-tv](android-tv/README.md). Saved private screen credentials, remote controls, HTTPS display fetch and expiry/revocation handling are implemented. This is an unverified physical-device pilot, not a Play Store release.

Guest Experience also offers optional first-name personalization during confirmed stays, using listing-local arrival/check-in and departure/checkout times. It is off by default. Ten automated checks cover access, timing, turnover, daylight-saving changes and existing booking/pricing logic.

One-time screen pairing codes are available in Guest Experience and the browser player. Apply `database/display_pairing.sql` after the device schema and redeploy the shared Edge Function. The Android source supports the same pairing flow; installable APK and physical TV verification are pending.

### Calendar controls

Overview edits listing settings; Bookings edits confirmed manual reservations and blocks/releases unavailable nights. Apply `database/calendar_controls.sql` after the base schema. A shared database exclusion constraint protects bookings and blocks against overlap. These changes are local to Treestand until approved channel publishing is connected. See [calendar controls](docs/calendar-controls.md).

## Airbnb security readiness

Host access requires authenticator MFA, except the explicitly exempt manual pilot owner. See [readiness and remaining gaps](docs/airbnb-readiness.md) and [security operations](SECURITY.md). Deploy the MFA interface before applying `database/host_mfa.sql`. Approval, live provider connections and paid onboarding remain pending.

## Door locks

The Door locks workspace supports inventory, room/shared-entrance assignments and guest-access drafts. [Integration status and live-automation prerequisites](docs/door-locks.md). No physical locks are controlled yet.
