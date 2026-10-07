# Fee and discount rules

Pricing now includes per-listing cleaning fees, included guest counts, per-person/per-night extra guest charges, weekly discounts at 7+ nights, monthly discounts at 28+ nights, and a last-minute arrival window. Zero fees/percentages disable those charges or discounts; a zero last-minute window disables that rule. Existing accounts start with no fee or discount changes.

Rules affect itemized estimates and explicitly requested booking charge drafts. They do not publish channel prices, rewrite saved nightly overrides, change existing booking charges, reserve inventory, collect money or determine taxes. Host confirmation remains required to save booking financial revisions.

Calculation order: existing listing/date rates → total accommodation → listing markup → largest eligible accommodation discount → once-per-stay cleaning plus extra guests above the included count × occupied nights. Discounts do not stack. Equal percentages prefer monthly, then weekly, then last-minute. Discounts do not apply to fees. Whole-cent rounding occurs on accommodation after markup and on the single discount total. The estimate omits taxes, other fees and host channel fees, and states this clearly.

Last-minute eligibility compares the arrival date with the supplied booking/quote date as calendar dates. The window includes same-day arrivals and its final day. Listing-local dates and UTC date arithmetic keep occupied-night/lead-day counts stable across DST. Historical bookings require a host-supplied actual booking date; insertion time is not treated as the original booking date. Quotes reject a date after arrival, invalid occupancy, stays below the listing minimum and estimates exceeding financial limits.

Bookings → Booking amounts → Preview current pricing rules shows the itemized draft before Use this draft in charge fields. That button changes only accommodation, discount, cleaning and extra guest fields. Manually entered taxes, other guest fees and host channel fees remain. The final confirmation and charge revision reason are still required; saved history remains immutable.

`ts_pricing_rules` uses owner/MFA RLS with the existing pilot exception. Every update increments a server-managed revision. The SECURITY INVOKER save RPC locks the owned listing and rejects stale expected revisions, malformed payloads and out-of-range settings. Ownership and listing identity cannot change. Explicit grants expose only the intended client operations; anonymous users receive none. Rule settings are not themselves historical financial records; saved booking charge revisions provide that history.

Validation covers nightly override ownership, markup/fee order, discount boundaries and ties, non-stacking, DST, full accommodation discounts with fees retained, invalid dates/occupancy/stay length, amount bounds, stale settings, ownership, MFA and anonymous denial. Live database validation uses rolled-back synthetic records.
