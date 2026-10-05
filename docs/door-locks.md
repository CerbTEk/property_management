# Door locks

The Door locks workspace provides owned lock inventory, optional TTLock lock/gateway IDs, listing assignments and confirmed-booking access plans. A lock can be assigned to multiple listings as a shared entrance. Each room's locks are assigned separately. Excluding a lock from plans or removing an assignment changes only Treestand planning; it does not change physical locks or existing passcodes.

All devices are unverified manual inventory. Entered IDs do not establish ownership or confirm that the gateway is online. No codes are generated, no passwords are stored and no door-control request is sent. Names and IDs entered by a host remain private to that host's account.

Access plans use the listing check-in time on arrival and checkout time on departure, with its IANA timezone. The conversion resolves the actual UTC offset, including DST and non-hour offsets. Missing or ambiguous local times fail closed. Plans recompute after booking/listing edits, exclude cancelled bookings and blocks, and include only active same-owner assignments. They are drafts, not access grants.

## Provider integration foundations

`server/ttlock.mjs` is a server-only module, outside the frontend import graph. The inventory adapter uses HTTPS form requests, bounded pagination, request timeouts, rejected redirects and sanitized errors. It returns only the minimal lock and gateway metadata; raw lockData, MAC addresses, network names and tokens are omitted. It is not connected to a deployed HTTP route or a credential store.

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

Nineteen automated checks pass across the PMS. Door-lock checks cover timezone conversion, DST ambiguity/gaps, ownership, assignment removal, password-only denial, cancelled/block exclusions and provider request/error handling. The frontend production build passes. No live provider or physical-lock test has occurred.
