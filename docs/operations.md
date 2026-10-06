# Property operations

Operations tracks host-owned cleaning, inspection and maintenance tasks. Manual tasks have a listing-local due date. Hosts can start, complete, dismiss and reopen tasks, and save notes. Completing work does not assert guest checkout, TV connectivity or physical lock cleanup.

`ts_prepare_checkout_tasks` generates cleaning and inspection tasks for an owned confirmed guest booking. The booking row is locked during preparation and the unique booking/type index makes repeated preparation idempotent. Existing progress and notes are retained.

Open/in-progress tasks follow booking departure and listing changes through an invoker trigger. Completed/dismissed records retain their historical listing and date. Cancelling a booking keeps open work visible for review; it does not silently mark cleaning as done. Reopening linked work adopts the current booking listing and date.

RLS enforces owner identity and the existing MFA/pilot rule. Composite foreign keys reject cross-owner listing/booking references. Invoker validation prevents changing task ownership, booking or type. Anonymous task access and RPC execution are denied. Hosts cannot delete history. UI updates use an `updated_at` comparison to reject stale edits.

No cleaners are invited or messaged. Tasks do not start financial or physical device operations. Tests exercise actual Postgres policies and triggers through PGlite plus local-date and cancelled-booking board behavior.
