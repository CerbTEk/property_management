# Booking to checkout

Overview and Bookings show owner-scoped stay preparation derived from saved manual reservations. Date changes, listing reassignment, cancellation, listing clock changes, TV settings and lock assignments appear after workspace refresh. Refresh runs after writes; a 30-second timer advances the local schedule while the view is open.

- Arrival and checkout counts use each property's local calendar day. A stay is active from check-in (inclusive) to checkout (exclusive). These labels describe schedule windows, not physical guest check-in/out.
- Blocks and other owners' bookings are excluded. Invalid or ambiguous DST times remain visible for review.
- TV preparation requires saved personalization and an unrevoked, unexpired registration without an unconsumed pairing code. Registration does not prove the TV is online. House rules are checked separately.
- Access preparation reuses the existing phone-ending policy, provider compatibility, lock assignment and overlapping-code checks. Output excludes PINs and does not assert installation. The durable server queue remains responsible for provider execution after activation.
- Cancelling a booking requires a host confirmation, releases availability, excludes the name from current TV personalization, and invokes the existing database change capture for access cleanup. No physical deletion is claimed without verification.
- Finished/cancelled stay cards keep cleanup explicitly unverified. This view does not expose the service-only access receipt ledger.

TV content refresh remains once per minute. Channel sync and live TTLock execution are still pending setup; this release adds no financial operations or physical lock writes. There is no new database schema.

Validation includes owner isolation, timezone day boundaries, exact check-in/out boundaries against the actual TV guest selector, date changes/cancellation, expired/pending screen credentials, DST errors and PIN omission.
