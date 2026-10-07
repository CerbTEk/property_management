# Calendar and operations reports

Reports is an owner-only host workspace blade using existing RLS-protected listing, reservation and task reads. No new permissions or external services are introduced. Staff workspaces cannot access it.

Choose inclusive start/end dates (up to 366 days) and all listings or one listing. Dates represent listing-local calendar nights rather than elapsed hours. Checkout nights are free; arrivals/departures use their own date inside the selected range.

Available inventory is selected listing-days less active blocked nights. Confirmed nights take precedence over blocks if inconsistent data exists, with a visible conflict warning. Duplicate/conflicting booking nights count once. Occupancy is booked nights divided by available nights; a fully blocked listing has no percentage. Portfolio percentages use summed nights, not averaged listing percentages. Invalid stay dates are excluded with a warning. Future occupancy is booked inventory, not completed guest stays.

Confirmed and cancelled stay counts include records whose intended nights overlap the range. Cancelled counts do not measure cancellation-event dates. Released blocks do not count as cancelled stays. Monthly rows clip boundary months; spanning stay counts appear in multiple months and are not additive. Night totals are additive.

Operations counts use due dates and current status. Overdue uses each listing timezone. This is not staff productivity or completion-date reporting.

CSV exports include listing/timezone or monthly period, capacity, booked/blocked/available/open nights, occupancy, overlapping stays, arrivals/departures, cancellations and conflicts. Exports omit guest names, phone numbers, access codes and credentials. String cells are quoted, escaped and neutralized against spreadsheet formulas.

Listing, reservation and operations-task workspace reads paginate in 500-record batches with exact initial counts and stable secondary ID sorting. Incomplete, duplicate or count-changing results fail rather than silently reporting capped data. The client read is not a database snapshot: simultaneous edits keeping the same count may still require a refresh. Reads over 100,000 records fail with an explicit message; server aggregates are a future scale improvement.

Saved booking charge revisions now support allocated booked charges and accommodation ADR with explicit coverage checks. Host-recorded completed payments and refunds now have a separate transaction-date report. Processor verification, RevPAR accounting and payouts still require reconciliation. Current rates never reconstruct historical earnings. No channel import is implied by a report.

Validation covers partial periods, back-to-back stays, active/released blocks, cancellations, conflicts, invalid dates, weighted occupancy, fully blocked inventory, month boundaries, leap days/DST, task timezone boundaries, listing selection, CSV safety and pagination failures.

## Booking charge reporting update

Saved booking charge revisions now provide booked charge, tax, channel-fee and accommodation ADR reporting. Financial coverage is explicit and stale records are excluded. This replaces the previous financial-reporting placeholder without claiming collected-payment or payout reconciliation. See [booking financials](booking-financials.md) for allocation and coverage rules.

## Payment record reporting update

Host-recorded completed payments, refunds and corrections now appear in a separate UTC transaction-date report and CSV exports, including cancelled bookings. These totals are distinct from nightly booked charges and processor verification. See [booking transactions](booking-transactions.md).
