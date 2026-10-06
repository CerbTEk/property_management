# Door locks

The Door locks workspace provides owned lock inventory, optional TTLock lock/gateway IDs, listing assignments and confirmed-booking access plans. A lock can be assigned to multiple listings as a shared entrance. Each room's locks are assigned separately. Excluding a lock from plans or removing an assignment changes only Treestand planning; it does not change physical locks or existing passcodes.

Manually entered devices are unverified inventory. Provider connections can import sanitized inventory. Entered IDs do not establish ownership or confirm that the gateway is online. No codes are generated, no passwords are stored and no door-control request is sent. Names and IDs entered by a host remain private to that host's account.

Access plans use the listing check-in time on arrival and checkout time on departure, with its IANA timezone. The conversion resolves the actual UTC offset, including DST and non-hour offsets. Missing or ambiguous local times fail closed. Plans recompute after booking/listing edits, exclude cancelled bookings and blocks, and include only active same-owner assignments. They are drafts, not access grants.

## Provider integration foundations

`server/ttlock.mjs` is a server-only module, outside the frontend import graph. The inventory adapter uses HTTPS form requests, bounded pagination, request timeouts, rejected redirects and sanitized errors. It returns only the minimal lock and gateway metadata; raw lockData, MAC addresses, network names and tokens are omitted. Read-only inventory is connected to the authenticated smart-lock connector and encrypted, owner-scoped account storage.

The timed-passcode request builder validates numeric code length, an explicit nonexpired access window, and uses period type 3 and gateway addType 2. It builds a request only; it does not send it. Raw credentials, codes and request/response payloads must not enter logs.

TTLock's current documentation requires an approved developer application (client ID/secret) and a token for the TTLock app account that owns the locks. Developer and app accounts are separate. Custom gateway passcodes require compatible devices; the documented legacy endpoint requires V4 passcodes. An entered gateway ID or hasGateway flag alone is not evidence of online readiness. TTLock states it provides no sandbox.

Sources checked October 5, 2026:
- https://euopen.ttlock.com/documentPages/htmlPages/userGuide/getStartedEn.html
- https://euopen.ttlock.com/documentPages/htmlPages/cloud/passcode/addEn.html
- https://euopen.ttlock.com/doc/api/v3/keyboardPwd/add
- https://euopen.ttlock.com/doc/api/v3/lock/list
- https://euopen.ttlock.com/doc/api/v3/gateway/list

## Before live door automation

1. Obtain approved application credentials and authorize the owning TTLock account through a secure server flow. Keep tokens encrypted and owner-scoped; implement refresh and disconnect.
2. Import and verify real lock identities, code compatibility, permissions and live gateway availability. Never trust manually entered IDs as provider authorization.
3. Add durable access jobs with per-lock outcomes, code collision checks and protected code storage. Confirm provider receipt before marking access active or sending it to a guest.
4. Implement booking changes/cancellations, expiry, reconciliation and cleanup. Check provider state before retrying a timed-out create request; do not create duplicate passcodes blindly. Shared entrances need overlapping-booking tests.
5. Validate on the owner's chosen physical test lock, with check-in, checkout and cancellation behavior verified before cutover from existing automation.

## Database and verification

Apply `database/door_locks.sql` before the frontend release. Both tables enforce authenticated ownership, same-owner composite foreign keys and restrictive MFA, retaining the owner's explicit development exception. Assignments can be removed by their owner; inventory is retained and can be excluded from plans.

Twenty-two automated checks pass across the PMS. Door-lock checks cover timezone conversion, DST ambiguity/gaps, ownership, assignment removal, password-only denial, cancelled/block exclusions and provider request/error handling. The frontend production build passes. No live provider or physical-lock test has occurred.

## Guest phone code rule

The owner-selected guest code is exactly the last four digits of the guest phone number, preserving leading zeros. New manual bookings accept a complete phone number and retain only the four-digit suffix; edits can correct that suffix or clear it. The full number is not saved by this feature. Existing bookings without a suffix require phone information before their access plan is ready.

The preview flags matching codes on the same assigned lock when confirmed stays overlap in actual time, including shared entrances across listings. It does not substitute a random code. Cancelled bookings and nonoverlapping checkout/check-in periods do not conflict. This is a draft conflict check; provider reconciliation with existing physical passcodes remains required before live provisioning.

The server-only booking request builder recomputes the rule from current booking/assignment data, rejects review issues and unassigned locks, and derives the code itself. It sends no request. Future execution must load this data under the authenticated owner, verify provider ownership/compatibility and reconcile lock state. Guest codes are not sent to welcome screens.

## Multi-brand connector
TTLock remains a direct server adapter. Optional Seam hosted provider authorization and read-only inventory sync support August, Yale, Schlage, Kwikset, igloohome, Lockly, Tedee and Nuki. Actual models require a supported keypad and provider connection. No paid account or physical device was activated by this release.

Apply `database/multi_brand_locks.sql`, then deploy `supabase/functions/smart-lock-connect/index.ts` with `server/seam.mjs`, `src/lock-providers.mjs`, `src/lock-model.mjs`, `src/phone-code.mjs`, `src/model.mjs` preserving their import paths. Set `SEAM_API_KEY` as a Supabase server secret; never a Vite/browser variable. Deploy with custom JWT authentication: getUser + getClaims, ownership and assurance checks are implemented inside the function. The development owner exception remains; launch requires removing it from this function, frontend, and all ten host RLS policies.

Each provider login creates an owner-bound connection. Sync checks both the stored owner and Seam customer/account/device ownership. Provider capability observations are server-managed. Manual entries never prove compatibility. The UI exposes no remote unlock. No code-writing HTTP endpoint is enabled. The Seam booking request builder preserves exact phone suffix including leading zeroes, refuses incompatible/offline/unknown devices, and disables backup/random-code substitution. Nuki's six-digit 1–9 constraint is incompatible with the current four-digit policy.

Before live automation: implement idempotent lifecycle jobs, receipt verification, cancellation/revocation, webhook authentication and stale inventory handling; then physically test each supported model. A successful inventory import does not prove code installation. Seam Unit Access is advertised at $5/device/month (check current pricing and action allowance before activation).
Sources: https://www.seam.co/docs/api/connect_webviews/create ; https://www.seam.co/docs/api/connect_webviews/get ; https://www.seam.co/docs/api/devices/list ; https://www.seam.co/docs/api/access_codes/create ; https://docs.nuki.io/guide/overview/concepts/ ; https://www.seam.co/pricing

Connection setup now verifies the Seam workspace with `GET /workspaces/get`, distinguishes sandbox/suspended/live state, and only enables provider sign-in after the workspace is verified. Saved connections can resume sign-in after a refresh without creating a new connection. Resume uses the same stored-owner and provider-customer checks as inventory sync. Frontend status rechecks on returning to the tab and displays connection availability and device import counts; clients are never sent to backend secret settings. Physical guest-code automation remains a separate unfinished milestone.

TTLock uses direct access exclusively. Seam remains optional for the other brands. New Seam sessions exclude TTLock, and the server rejects TTLock selected in older sessions. Direct TTLock account sign-in, token renewal, disconnect and inventory sync are implemented through the authenticated connector. Apply `database/ttlock_accounts.sql` before deploying. Add `server/ttlock-auth.mjs`, `server/direct-ttlock.mjs` and `server/ttlock.mjs` to the edge bundle alongside the previously listed modules.

CerbTek configures TTLOCK_CLIENT_ID, TTLOCK_CLIENT_SECRET and TTLOCK_TOKEN_ENCRYPTION_KEY once as server secrets. Generate the encryption key with `openssl rand -hex 32` and keep it in secret storage; never use a Vite variable or commit it. Clients sign in with their own TTLock app account in Door locks. TTLock requires its password digest for token issuance; passwords and their digests are not persisted. Access and refresh tokens use AES-256-GCM with random IVs and owner/application-bound authenticated data. Browser roles can read only owner-scoped status columns. Token refresh preserves the provider identity because TTLock's documented refresh response omits UID. Revision checks prevent refresh or sign-in from overwriting a concurrent disconnect/reconnect. Service-only database sign-in claims enforce a 15-second retry interval per owner.

Direct inventory sync does not depend on SEAM_API_KEY and the deployed route never uses a shared pilot access token. Disconnect destroys local tokens and clears imported capability observations; it does not revoke TTLock app access elsewhere or change existing physical codes. Platform credentials and real account validation remain required before claiming a working live connection. Code lifecycle writes, receipt verification and physical tests remain pending.

Sources: https://euopen.ttlock.com/doc/oauth2 ; https://euopen.ttlock.com/doc/oauth2/refreshToken

Native expansion and manufacturer onboarding are tracked in [native-lock-integrations.md](native-lock-integrations.md). Brand registration and inventory adapters do not constitute verified physical access automation.
