# Browser welcome display

Hosts save welcome text, a house guide, recommendations and contact details in Guest Experience. Create a screen link for a named device and open it in a modern TV browser or a computer attached to the TV. Select Full screen when supported. Native Fire TV, Roku and other TV app packaging is not implemented.

Each screen gets a randomly generated 256-bit credential. The host sees the link once. Its fragment is removed from the URL after the player stores it locally. The database stores only its SHA-256 hash. Links expire after 90 days; owners can permanently revoke them and create replacements. A link is a bearer credential: anyone holding it can read this room's saved guest-facing content. Avoid putting door codes or other host-only secrets in that content.

The player refreshes every minute. On connection failure, expiry or revocation it clears the displayed content. Disconnect removes the credential from that browser; revoke in the host workspace to invalidate any copies. Device status means a link is active, not proof the TV is online.

The guest-display Edge Function implements custom device bearer authentication; the platform JWT check is disabled because TVs use device credentials, not host sessions. Every request checks hash, revocation and expiry before reading property and display records with explicit property and owner filters. The endpoint returns no reservation data, owner IDs, prices or host session. Responses are no-store. Direct anonymous table access is denied; host access uses ownership RLS, and hosts can only update the revoked field on device records.

This release uses a generic Guest greeting. Reservation-based timing and personalization, media uploads, Wi-Fi sharing, weather, store and AI chat remain pending. No WelcomeScreen app pairing or integration is modified by this release.

Validation: six automated checks pass including database ownership, device immutability and revocation, endpoint authorization and response scoping, existing bookings, calendar and rates. Live endpoint verification uses a temporary screen that is revoked and removed after the check. Physical TV testing remains required.
