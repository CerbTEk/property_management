# Browser welcome display

Hosts save welcome text, a house guide, recommendations and contact details in Guest Experience. Create a screen link for a named device and open it in a modern TV browser or a computer attached to the TV. Select Full screen when supported. Native Fire TV, Roku and other TV app packaging is not implemented.

Each screen gets a randomly generated 256-bit credential. The host sees the link once. Its fragment is removed from the URL after the player stores it locally. The database stores only its SHA-256 hash. Links expire after 90 days; owners can permanently revoke them and create replacements. A link is a bearer credential: anyone holding it can read this room's saved guest-facing content. Avoid putting door codes or other host-only secrets in that content.

The player refreshes every minute. On connection failure, expiry or revocation it clears the displayed content. Disconnect removes the credential from that browser; revoke in the host workspace to invalidate any copies. Device status means a link is active, not proof the TV is online.

The guest-display Edge Function implements custom device bearer authentication; the platform JWT check is disabled because TVs use device credentials, not host sessions. Every request checks hash, revocation and expiry before reading property and display records with explicit property and owner filters. The endpoint returns no booking records, owner IDs, prices or host session. When the host enables personalization, its title contains only the first name for the current confirmed stay. Responses are no-store. Direct anonymous table access is denied; host access uses ownership RLS, and hosts can only update the revoked field on device records.

Personalization is off by default. When enabled in Guest Experience, the screen shows the current confirmed guest’s first name from the listing’s local check-in time on arrival day until its local checkout time on departure day. Outside that window, or if stays are ambiguous, it uses Guest. Timezone and daylight-saving handling are tested. This uses only bookings saved in Treestand; channel booking import is still pending. Media uploads, Wi-Fi sharing, weather, store and AI chat remain pending. No WelcomeScreen app pairing or integration is modified by this release.

Validation: eleven automated checks pass including database ownership, device immutability and revocation, endpoint authorization and response scoping, existing bookings, calendar and rates, local stay timing, checkout, turnover and daylight-saving transitions. Live endpoint verification uses a temporary screen that is revoked and removed after the check. Physical TV testing remains required.

## One-time pairing

Guest Experience offers Create pairing code alongside Create browser link. Pairing codes contain 16 randomly generated characters from a 31-character alphabet, excluding zero and the letter O. The host shows four groups of four characters with dashes. The TV player has four matching input boxes with fixed dashes, advances after each full group, and accepts a pasted complete code with or without separators. Codes are shown once, stored as SHA-256 hashes, and expire after 30 minutes (enforced by the database insert policy). Apply `database/display_pairing_lifespan.sql` after the original pairing schema. Existing codes keep their original expiry. Enter a code at `/display/` or in the Android app. The code is a temporary bearer credential and should remain private.

One conditional database UPDATE checks the code hash, pairing expiry, device expiry and revocation, clears the pairing fields and replaces the unused token hash. Only the successful claim receives a new 256-bit screen token; replay or concurrent losing claims fail. Direct table access remains owner-only. Owners cannot edit pairing hashes or re-enable revoked devices. Expired unpaired rows remain visible for revocation; there is no automatic deletion.

## Photo slideshow and house rules

Apply `database/display_media.sql` to add dedicated house rules, a 10/20/30/60-second rotation setting, twelve image slots per listing, and the private `treestand-display-images` bucket. JPG, PNG and WebP uploads are limited to 8 MiB each. Host table and storage policies enforce listing ownership and MFA (with the existing authorized pilot exception). Photo URLs are signed only after a valid device credential and explicit owner/listing checks, for 120 seconds; the player refreshes within a minute. Removing a photo withdraws it at the next refresh; a previously signed URL may work until its short expiry.

The browser guest screen has generated woodland starter images, a slow crossfade, previous/next/pause controls, and remote-sized House Rules, House Guide, Explore Nearby and Your Host buttons. Uploaded listing photos replace the starter collection. Guest panels support arrow-key scrolling and Back/Escape. Rules come from the dedicated House Rules field saved in Guest Experience, with the same minute refresh as the rest of the content. This does not import Airbnb rules or record guest acceptance.

Hosts can preview the current draft and uploaded photos full screen. `/display/demo` is a clearly marked public sample with fictional content and no host data. The installed Java Android pilot still renders its existing text layout; this new visual experience is delivered by the TV browser, including LG webOS.

Starter scenes are generated generic landscape artwork, not photos of any actual listing: sunrise woodland lake, sunlit forest path and mountain sunset. Assets: `public/tv-scenes/woodland-lake.webp`, `forest-path.webp`, `mountain-sunset.webp`. Generated using the built-in image tool with prompts for wide, natural, comforting landscapes, warm evergreen/honey tones, no people/buildings/text/logos/watermarks.

## Automatic tranquil music

Apply `database/display_music.sql`. Hosts can enable/disable automatic music, select Woodland Calm / Evening Drift / Quiet Shores and choose starting volume from 0–40%. These are original, locally synthesized ambient instrumentals using soft sine harmonics, slow chord progressions and gentle note envelopes. No external recordings or streaming accounts are used.

The TV attempts playback when the welcome screen mounts. Browser autoplay restrictions may require a remote interaction; in that case it retries on a trusted pointer/key input and displays its waiting state. Guests retain pause, mood and volume controls. Guest pause is respected on return to the screen. Audio stops on hidden/disconnected/revoked screens and unmount, and attempts to resume when the visible screen returns unless the guest paused it. Host defaults update on the usual minute refresh. Failed audio permission times out and closes its context; unsupported browsers show an error. Physical audio validation on LG webOS remains required. The native Android Java pilot is unchanged.

## LG webOS packaged pilot

The webOS pilot bundles the same welcome player locally, adds branded LG launcher/splash artwork and remote spatial focus, hides the browser fullscreen action and provides Back/exit and disconnect confirmation. Four-group pairing, locally stored device credentials, photos, rules and music use existing guest-display behavior. Physical browser testing was reported successful by the host; packaged-app installation and physical acceptance remain pending. Code updates need a new IPK; room content continues refreshing. See [LG installation](../webos-tv/INSTALL.md). CI validates/builds/packages the IPK and provides a checksum artifact. Permanent LG Apps distribution requires seller submission and approval; Developer Mode is temporary.
