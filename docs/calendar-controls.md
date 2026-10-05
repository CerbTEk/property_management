# Manual calendar controls

Overview provides Edit listing settings for name, timezone, occupancy, minimum stay and check-in/checkout times. Rates remain in Pricing. New restrictions are enforced when creating or changing a booking; existing bookings are retained. Timing changes affect personalized guest displays.

Bookings includes Edit booking for confirmed manual reservations, including listing, guest, dates, occupancy and notes. Changes stay in Treestand; channel publishing and booking import are not connected.

Blocked dates stores maintenance or owner stays as explicit block records in the same calendar table, with a kind separate from bookings. The end date is available again. Release dates cancels a block while retaining its history. Blocks are distinguished in the calendar and excluded from reservation counts and guest-display selection.

A single GiST exclusion constraint protects confirmed bookings and active blocks together, including updates and concurrent writes. Blocks skip guest occupancy/minimum-stay rules but still require a visible owned listing, valid dates and ownership RLS. Cancelled bookings and released blocks no longer occupy nights. The migration adds the stronger constraint before removing the previous booking-only constraint; it preserves existing booking records.

Twelve automated checks pass, including booking edits into occupied periods, booking/block conflicts in both directions, released-date reuse, calendar end-date semantics, ownership, guest display timing and existing pricing behavior. Provider publishing and UI/physical device validation remain pending.
