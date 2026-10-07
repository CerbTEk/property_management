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

The owner-selected guest code is the last four digits of the guest phone number, preserving leading zeros. Tedee uses the explicitly approved brand exception: prepend one zero to that suffix, producing five digits. A phone ending 0042 therefore produces Tedee code 00042 and TTLock code 0042. Tedee codes must contain at least three distinct digits and must not be strictly ascending or descending; invalid codes require review, without automatic substitution. New manual bookings accept a complete phone number and retain only the four-digit suffix; edits can correct that suffix or clear it. The full number is not saved by this feature. Existing bookings without a suffix require phone information before their access plan is ready.

The preview flags matching codes on the same assigned lock when confirmed stays overlap in actual time, including shared entrances across listings. It does not substitute a random code. Cancelled bookings and nonoverlapping checkout/check-in periods do not conflict. This is a draft conflict check; provider reconciliation with existing physical passcodes remains required before live provisioning.

The server-only booking request builder recomputes the rule from current booking/assignment data, rejects review issues and unassigned locks, and derives the code itself. It sends no request. Future execution must load this data under the authenticated owner, verify provider ownership/compatibility and reconcile lock state. Guest codes are not sent to welcome screens.

## Multi-brand connector
TTLock remains a direct server adapter. Optional Seam hosted provider authorization and read-only inventory sync support August, Yale, Schlage, Kwikset, igloohome, Lockly, Tedee and Nuki. Actual models require a supported keypad and provider connection. No paid account or physical device was activated by this release.

Apply `database/multi_brand_locks.sql`, then deploy `supabase/functions/smart-lock-connect/index.ts` with `server/seam.mjs`, `src/lock-providers.mjs`, `src/lock-model.mjs`, `src/phone-code.mjs`, `src/model.mjs` preserving their import paths. Set `SEAM_API_KEY` as a Supabase server secret; never a Vite/browser variable. Deploy with custom JWT authentication: getUser + getClaims, ownership and assurance checks are implemented inside the function. The development owner exception remains; launch requires removing it from this function, frontend, and all ten host RLS policies.

Each provider login creates an owner-bound connection. Sync checks both the stored owner and Seam customer/account/device ownership. Provider capability observations are server-managed. Manual entries never prove compatibility. The UI exposes no remote unlock. No code-writing HTTP endpoint is enabled. The Seam booking request builder uses each lock’s brand-specific code (Tedee: zero plus the suffix; other compatible brands: exact suffix), refuses incompatible/offline/unknown devices, and disables backup/random-code substitution. Nuki's six-digit 1–9 constraint is incompatible with the current four-digit policy.

Before live automation: implement idempotent lifecycle jobs, receipt verification, cancellation/revocation, webhook authentication and stale inventory handling; then physically test each supported model. A successful inventory import does not prove code installation. Seam Unit Access is advertised at $5/device/month (check current pricing and action allowance before activation).
Sources: https://www.seam.co/docs/api/connect_webviews/create ; https://www.seam.co/docs/api/connect_webviews/get ; https://www.seam.co/docs/api/devices/list ; https://www.seam.co/docs/api/access_codes/create ; https://docs.nuki.io/guide/overview/concepts/ ; https://www.seam.co/pricing

Connection setup now verifies the Seam workspace with `GET /workspaces/get`, distinguishes sandbox/suspended/live state, and only enables provider sign-in after the workspace is verified. Saved connections can resume sign-in after a refresh without creating a new connection. Resume uses the same stored-owner and provider-customer checks as inventory sync. Frontend status rechecks on returning to the tab and displays connection availability and device import counts; clients are never sent to backend secret settings. Physical guest-code automation remains a separate unfinished milestone.

TTLock uses direct access exclusively. Seam remains optional for the other brands. New Seam sessions exclude TTLock, and the server rejects TTLock selected in older sessions. Direct TTLock account sign-in, token renewal, disconnect and inventory sync are implemented through the authenticated connector. Apply `database/ttlock_accounts.sql` before deploying. Add `server/ttlock-auth.mjs`, `server/direct-ttlock.mjs` and `server/ttlock.mjs` to the edge bundle alongside the previously listed modules.

CerbTek configures TTLOCK_CLIENT_ID, TTLOCK_CLIENT_SECRET and TTLOCK_TOKEN_ENCRYPTION_KEY once as server secrets. Generate the encryption key with `openssl rand -hex 32` and keep it in secret storage; never use a Vite variable or commit it. Clients sign in with their own TTLock app account in Door locks. TTLock requires its password digest for token issuance; passwords and their digests are not persisted. Access and refresh tokens use AES-256-GCM with random IVs and owner/application-bound authenticated data. Browser roles can read only owner-scoped status columns. Token refresh preserves the provider identity because TTLock's documented refresh response omits UID. Revision checks prevent refresh or sign-in from overwriting a concurrent disconnect/reconnect. Service-only database sign-in claims enforce a 15-second retry interval per owner.

Direct inventory sync does not depend on SEAM_API_KEY and the deployed route never uses a shared pilot access token. Disconnect destroys local tokens and clears imported capability observations; it does not revoke TTLock app access elsewhere or change existing physical codes. Platform credentials and real account validation remain required before claiming a working live connection. Code lifecycle writes, receipt verification and physical tests remain pending.

Sources: https://euopen.ttlock.com/doc/oauth2 ; https://euopen.ttlock.com/doc/oauth2/refreshToken

Native expansion and manufacturer onboarding are tracked in [native-lock-integrations.md](native-lock-integrations.md). Brand registration and inventory adapters do not constitute verified physical access automation.

Tedee requires an online bridge, compatible keypad and observed five-digit custom-code capability. Nuki remains incompatible; a zero prefix cannot satisfy its six-digit 1–9 requirement. Fifty-nine automated checks and the production build pass; live code writes remain disabled.

Native Tedee and igloohome account linking now includes token renewal and read-only lock imports. Native devices use their own provider namespace and require server import; clients can rename, enable and assign them but cannot forge capabilities. Code capability remains unverified, so native access plans require review. See the native integration document for the inventory migration and deployment bundle.

## Durable access lifecycle — October 6

`database/access_lifecycle.sql` adds an owner-coalesced job queue and service-only receipt ledger. Reservation creation, edits, cancellation/deletion; listing edits; lock/assignment edits; and native account changes increment a durable revision in the same database transaction. Existing hosts are seeded. Jobs contain no guest data or PINs. The queue has no automatic physical execution or scheduled consumer enabled by this release.

`server/access-lifecycle.mjs` derives create/update/replacement/revocation plans from a complete current owner snapshot. Cancellation, assignment removal, disabled locks, missing phone information and checkout expiry invalidate existing grants. Phone/device changes require confirmed removal before recreation. Unknown provider outcomes and duplicate receipts require reconciliation; blind create retries are forbidden. Existing overlapping receipt codes also block creation. A replacement action is a staged intent, not an instruction to revoke and immediately recreate in one unchecked call.

Receipt code comparisons use HMAC-SHA256 with a dedicated 32-byte server secret (`fingerprintKey`), bound to owner/provider/device. No raw PIN is persisted in receipts or returned by the planner. Keep the fingerprint key stable; rotating it requires receipt reconciliation. Guest codes remain derived from current reservations only in the separate server request builder. Review messages may contain private listing/lock names and must not be logged.

Create/update plans require server-verified device observations no older than five minutes: ownership/connection, online state, timed-code support and exact code length. TTLock additionally needs an online gateway and passcode version 4. Cached imported inventory is insufficient. The planning store deliberately supplies no such observations until the live verifier is implemented.

`server/access-worker.mjs` provides a planning runner and Supabase store, with atomic 120-second claims and revision-fenced completion. A concurrent edit or expired lease prevents stale completion. Failed snapshots remain pending until lease expiry. The runner is not scheduled and its returned plans are not executed. Queue completion is planning completion only, never proof of a physical passcode change. Before adding a write worker, persist an uncertain receipt **before** the provider call, verify state afterward, fence every mutation against the current lease/revision, and reconcile timeouts using provider code identities. Save installed/revoked only after provider confirmation. Final live activation still requires credentials, model verification, and a chosen physical test lock.

## Native TTLock execution and test runner

`server/ttlock-access.mjs` implements native gateway create/change/delete requests and passcode inventory verification. Preflight reads the connected account's lock and gateway inventories, checks gateway association, confirms V4 passcodes, and queries lock state through the gateway. It does not unlock the door. The Door locks page now offers **Check gateway and code support** for TTLock devices. Cached capabilities cannot authorize writes.

`server/access-execution.mjs` recomputes each action from a complete current owner snapshot, derives the four-digit guest PIN server-side, refuses unmanaged PIN collisions, and checkpoints an uncertain receipt before sending a request. Existing provider code IDs must match the stored receipt label and protected code tag before update/removal. Each receipt has a unique `Treestand <receipt UUID>` marker. Provider responses are acknowledged separately; exact passcode identity/window verification is required before marking installed, and confirmed absence after an acknowledged delete is required before marking revoked. Timeouts never trigger blind retries. Missing or mismatched results require review. A positive provider confirmation still needs a physical keypad test before launch.

Apply `database/access_execution.sql` after the lifecycle migration. Its checkpoint/acknowledgement/settlement RPCs are service-only and enforce queue ownership, revision, lease expiry and per-operation fencing tokens. Active booking/lock routes cannot have duplicate receipts. An edit racing a provider operation leaves an uncertain receipt for reconciliation rather than overwriting newer work.

`server/ttlock-runner.mjs` and `supabase/functions/treestand-access-runner/index.ts` provide the internal native execution runner. It authenticates against the server service-role credential, accepts no caller-selected owner/device/PIN, processes at most five hosts and one mutation per host per invocation, and limits execution to explicitly selected owner/device pairs. It never routes TTLock through Seam. Hosts outside the test allowlist are not connected to their provider. No scheduled invocation or physical write is enabled by this release.

Platform setup requires `TTLOCK_CLIENT_ID`, `TTLOCK_CLIENT_SECRET`, and a 32-byte hex `TTLOCK_TOKEN_ENCRYPTION_KEY`. The execution runner additionally requires a separate stable 32-byte hex `TREESTAND_ACCESS_FINGERPRINT_KEY`. Keep both keys in Supabase secrets, never browser variables or GitHub. A host connects their own TTLock app account in Treestand. Only after connection, inventory import, assignment and selection of a physical test device should `TTLOCK_AUTOMATION_TEST_DEVICES` contain comma-separated `<owner UUID>:<TTLock device ID>` pairs and `TTLOCK_AUTOMATION_ENABLED` be set to `true`. These are platform test controls, not client onboarding requirements. Cron activation remains a separate step after credentials and the physical test are established. Internal invocation needs no user body and must not expose the service credential in the browser.

Current limitations: the scheduler is not enabled; no physical door has been tested; unknown writes without a verifiable matching receipt remain blocked for review; provider-side manual deletion/edit detection for otherwise unchanged installed receipts still needs a periodic reconciliation sweep. Manufacturers other than TTLock are not handled by this execution worker.

TTLock API documentation checked October 6, 2026:
- https://euopen.ttlock.com/doc/api/v3/keyboardPwd/add
- https://euopen.ttlock.com/doc/api/v3/keyboardPwd/change
- https://euopen.ttlock.com/doc/api/v3/keyboardPwd/delete
- https://euopen.ttlock.com/doc/api/v3/lock/listKeyboardPwd
- https://euopen.ttlock.com/doc/api/v3/gateway/listByLock
- https://euopen.ttlock.com/doc/api/v3/gateway/list
- https://euopen.ttlock.com/doc/api/v3/lock/queryOpenState

## Seam execution and scheduler — October 7

Seam now shares the revision-fenced execution runner with native TTLock. The Seam adapter verifies the owner's completed connection, connected account and device before reads and writes. It programs the derived guest code with the exact stay window, updates an existing receipt when dates change, and stages removal before replacement. Managed and unmanaged PIN collisions block creation. Pending programming results remain uncertain until the exact code identity, protected tag and time window are confirmed set or scheduled on the device. Removal additionally requires an authenticated `access_code.removed_from_device` event after the operation checkpoint, not merely an HTTP delete acknowledgement. Periodic audits flag external edits without overwriting them.

Apply `database/seam_access_execution.sql`, deploy the updated `smart-lock-connect` and `treestand-access-runner` dependency graphs, then apply `database/access_runner_schedule.sql`. The scheduler runs every minute using a dedicated random Vault token; only its SHA-256 digest is readable by the server worker. Browser roles cannot access credentials, activation rows, the queue or receipt ledger. The connector exposes only owner-scoped receipt summaries and activation status, with no PIN/tag/provider credential. Host buttons can verify live device connection and code capability without changing door access.

Seam devices require service-managed activation in `ts_access_device_activation` after a controlled model/keypad test. Its primary key is `(owner_id, provider, device_id)`. Do not remove activation while active receipts still need cleanup. With no activated devices, the scheduled worker never contacts a host provider or writes codes. TTLock keeps its existing native credential and test-device controls and is never routed through Seam.

Physical completion still requires a host to authorize their own provider account, import/assign the lock, verify capability and test the keypad with a controlled reservation. Check creation, date changes, cancellation and expired access before enabling guest use. Provider confirmation and automated tests do not prove physical keypad behavior. No lock had been imported at deployment time.

API methods verified against Seam's current documentation and official JavaScript SDK (`@seamapi/http` 2.35.0): POST `/access_codes/create`, PATCH `/access_codes/update`, DELETE `/access_codes/delete`, GET `/access_codes/list`, GET `/access_codes/unmanaged/list`, GET `/events/list`. No public code-writing endpoint, webhook receiver or remote-unlock action is exposed; authenticated periodic polling drives reconciliation.

The deployed worker falls back to a stable, server-only Vault fingerprint key when the legacy environment secret is absent. Apply `database/access_worker_runtime_config.sql` after the scheduler migration. Its private service-only accessor returns only this secret to the authenticated backend; browser roles have no execution privileges. No plaintext secret is committed or returned to hosts.
