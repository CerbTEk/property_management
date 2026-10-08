# Saved guests and private host reference

The host Guests page retains each guest profile, full phone number, optional 1â€“5 rating, private notes, and linked booking history. Host ownership and the existing MFA requirement apply to profile reads and writes. The guest TV endpoint never reads profiles or includes host ratings, notes, or phone numbers.

Manual bookings and CSV imports save full phone numbers when provided. US numbers without a country prefix normalize to +1; international numbers require + and the country code. The existing last-four door-code field is derived from the full number. A full phone number reuses the same profile within a host account; hosts can also explicitly select a saved profile for a guest without a number. Phone matches are not used for authentication or access authorization.

The returning-guest badge counts earlier confirmed stays linked to the same profile after their checkout time, using the listing timezone. Canceled stays, blocked dates, future stays and other hostsâ€™ records are excluded. It appears in Bookings and stay-preparation cards, including Today.

Legacy bookings receive separate profiles because their original full numbers were discarded. Their profile IDs equal the original booking IDs, retaining history without updating bookings or replaying operational triggers. Add the guestâ€™s full number in Guests, then select that saved profile on future bookings. Names or four-digit phone suffixes never automatically merge profiles. Previously imported receipts remain immutable; reimporting a legacy receipt does not fill its missing phone. Edit its guest profile instead.

Apply database/guest_profiles.sql before deploying the updated host website. Existing TV packages remain compatible and need no update for this host-only feature.
