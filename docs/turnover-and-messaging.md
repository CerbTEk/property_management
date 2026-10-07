# Automatic turnovers and message preparation

## Operations

New confirmed guest bookings create one cleaning task and one inspection task in the booking transaction. Repeated edits do not duplicate tasks. Blocks and cancelled bookings create no tasks. Existing bookings are not backfilled automatically; use **Prepare existing bookings**. Cancelling a stay retains tasks for host review rather than deleting work history. Reconfirmation does not reopen dismissed or completed work.

Each listing can save a cleaning checklist and an inspection checklist, up to 30 items of 160 characters. New tasks snapshot the current checklist, or a standard three-item checklist if none is saved. Saving an empty template intentionally removes checklist requirements for future tasks. Editing a template never changes existing tasks. Listing changes retain the original task checklist for review. A task cannot be marked completed until every item is checked. Existing tasks from before this release retain an empty checklist. Stale updates fail and require refresh.

Staff assignments, cleaner accounts and reminder delivery are future work. Task completion does not prove guest checkout or verified lock revocation.

## Messages

Saved templates support editing and archival. Property-specific rules copy a template's body or use separately entered text; subsequent template edits do not modify existing rules. Rules use confirmation, check-in or check-out with a signed offset in minutes (up to seven days before or after). Supported variables: guest, property, arrival, departure, check_in and check_out. Unverified door codes and arbitrary variables are rejected.

The database creates durable, unique booking/rule plans. Booking, rule and listing edits recalculate times and rendered messages. Cancelled bookings, paused rules and changed listing mappings suppress plans. Dismissed plans remain dismissed through subsequent edits. Invalid/missing/ambiguous local times receive a needs-review state and no send time. Offsets represent elapsed minutes; -1440 is 24 elapsed hours before the event. Confirmation is anchored to the booking's original created_at timestamp.

New rules include existing bookings, including past-due plans. All delivery is disabled. No scheduler sends, provider credentials, guest email/phone delivery routes or delivery receipts are implemented in this release. The queue is preparation, not an active outbox. Before enabling a future worker, require host approval of past-due plans, verified destinations, immutable send snapshots, cancellation/version fences, leases, deduplication and provider receipt reconciliation. Never automatically flush this preparation backlog.

Queue creation is restricted to non-callable database row triggers. The trigger function uses fixed search_path, validates the authenticated owner and confines reconciliation to that owner. Hosts may only dismiss their own queue rows; they cannot alter a rendered body, schedule, booking, owner or delivery state. Every exposed table has owner RLS and the existing host MFA policy. The authorized development pilot exception is unchanged.
