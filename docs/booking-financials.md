# Saved booking charges

Bookings now offers Add booking amounts / Booking amounts alongside each reservation. Enter USD accommodation for the whole stay, accommodation discount, cleaning, extra guest and other guest fees, taxes charged, and host channel fees. Enter a revision reason and confirm these reflect agreed booking charges. The optional current-rate button creates an editable accommodation draft only; the host must verify it. Zero is valid for waived charges.

The host enters taxes actually charged. There is no automatic tax determination, registration, remittance, payment collection, payout, refund, cancellation-fee accounting or financial advice. Stripe configuration and guest charges are unchanged.

Each save appends an immutable revision in `ts_booking_financials`. Earlier revisions remain visible, including for cancelled bookings. Saving does not change previous records. Server validation binds the owner and booking context (listing, arrival, departure and guest count), locks the booking, checks the expected revision, stamps the timestamp and validates integer-cent limits and totals. Discount is limited to accommodation; host channel fees cannot exceed the guest total. New revisions require an active confirmed booking. Blocks are excluded. RLS restricts reads/inserts to the owner and host MFA (existing pilot exception retained). UPDATE/DELETE are not granted; an immutable trigger also rejects them. Public functions are security invoker with fixed search paths and explicit grants; no new privileged public RPC exists.

Booking changes flag the latest revision for review until charges are confirmed again. Rate changes do not modify snapshots. This is charge revision history, not payment history. A guest-name-only change does not invalidate the amounts.

## Report interpretation

Reports shows saved booked charges excluding taxes, separate taxes and host channel fees, and accommodation ADR. Figures use only the latest revision matching the current confirmed booking. Missing/stale stays are excluded with a visible partial-coverage warning. Cancelled bookings are excluded entirely; cancellation fees and refunds are not modeled yet. Future dates represent booked charges rather than realized cash or earned accounting revenue.

All fields are allocated evenly over listing-local occupied nights. Whole cents are preserved: quotient cents go to every night and remainder cents to the first nights. Monthly and clipped-range totals add back exactly to the stored charge, including DST boundaries. Accommodation ADR uses accommodation less accommodation discount divided by booked nights, only when every booked night has valid financial coverage and no calendar conflict exists. Portfolio ADR uses total amounts and nights, not an average of listing ADRs.

Charge CSV exports contain integer-cent columns, USD currency, date range and coverage counts. ADR cents can contain fractional cents because it is an average. CSVs omit guest names, phone numbers, codes and revision notes. Export amounts describe the allocation above; they are not processor settlement statements.

Financial history workspace reads paginate with completeness checks. All history is retained; a server aggregation route is a future scale improvement.

Validation covers isolation/MFA, anonymous denial, immutable history, stale revisions and booking context, cancellation, bounds/fractional cents, current-rate independence, exact-cent allocation, missing/stale coverage, ADR and export privacy. Production smoke tests use transaction-rolled-back synthetic records only.
