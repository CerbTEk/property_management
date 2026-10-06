# Pricing workspace

The Pricing blade offers a listing-specific nightly calendar, single-date and inclusive date-range edits, selected weekdays, fixed base prices, signed percentage adjustments, minimum/maximum bounds for each edit, and restoration to weekday/weekend base rates. Friday and Saturday use weekend pricing; Sunday through Thursday use weekday pricing. Markup applies after base pricing, including overrides. Existing reservations are not repriced. Saved prices are internal until approved channel publishing is connected.

Each bulk action requires a preview. The `ts_edit_rates` security-invoker RPC checks listing ownership through RLS, preserves the restrictive MFA policies, locks the listing and existing affected rate rows, checks the preview's original prices, and applies all nights in one transaction. Any stale rate, invalid bound, or mismatched selection rolls back the complete action. Reset removes selected override rows using the same owner/MFA policies. No service key is used in the client.

## Area comparisons

Hosts save a comparison market and accommodation type on each listing, then record comparable rates with a public HTTPS source, stay dates, guest count, accommodation-only nightly rate and observation date. Inputs are host observations, not a live market feed or booked-rate data. There is no scraping, provider subscription or automatic publication.

Advice requires at least three distinct source URLs with the exact listing market (case-insensitive), accommodation type, stay dates and guest count, observed no more than 30 days ago. Stale, future, foreign-listing and mismatched observations are excluded. The median and observed range are shown with the sources. The proposed base price divides the observed guest-facing median by the host markup factor, so markup is not applied twice. Hosts transfer the suggestion into the date editor and review the preview before saving. Comparables remain private to their listing owner and MFA policy; deleting one removes it from future advice.

These inputs do not establish the best revenue-maximizing price. Automatic local demand, event, seasonality and occupancy-based recommendations require an approved market-data connection and validation. No fabricated local prices are seeded into real accounts.

## Validation

Pricing tests exercise inclusive ranges, leap-year bounds, weekday filters, percentage edits, overrides, reset, markup, market matching and local date handling. Database tests exercise atomic rollback, stale previews, foreign ownership, MFA, invalid observations, anonymous denial and reset. Production verification uses transaction-rolled-back synthetic rows, retaining the owner's real listing rates.
