# Automatic photo videos for LG

Hosts still upload JPG, PNG and WebP photos in Guest Experience (12 photos, 8 MiB each). An LG welcome screen uses a silent, full-viewport H.264 MP4 made from those photos, with the guest greeting, information panels and synthesized music remaining separate. The browser welcome player and host preview keep the existing photo controls. Installed LG apps use continuous video playback instead of a slideshow pause control.

Photo additions, removals, position changes and saved slide duration changes automatically queue conversion. Caption-only changes do not re-encode. A GitHub Actions job checks the queue approximately every five minutes (GitHub may delay scheduled runs), encodes up to three jobs and uploads each video privately. Conversion uses 720p, 15 fps, one-second crossfades, the saved 10/20/30/60-second slide duration, no audio track, and a maximum 64 MiB output. The loop crossfades back to the first photo. Photo ordering follows saved position.

Added photos preserve the previous video while the replacement renders. Removing a photo immediately withdraws the old video reference, so the TV switches to its bundled woodland video on its next refresh until conversion finishes. No uploads means the bundled woodland video. Retired and abandoned output files are cleaned up after signed URLs expire. The TV downloads each published version once and uses a local object URL; renewing signed URLs on minute refreshes does not restart playback. Leaving the app pauses video; disconnecting clears it. A visible failure message and original photo fallback remain available when video playback fails.

## Hosting and access

Apply `database/display_video.sql`, deploy `display-video-worker` and the updated `guest-display`, and install LG pilot version 0.2.0. The guest-display deployment must preserve the separately deployed automatic guest-turnover change and live pairing-code validation. Deploy worker with platform JWT verification disabled: it verifies GitHub's RS256 signature, issuer, audience, token lifetime, immutable repository/owner IDs, workflow path, event and branch before accessing any queue or storage record. The guest endpoint retains its existing device authentication. No Supabase administrator key is sent to GitHub or the TV.

The workflow is `.github/workflows/display-video.yml`. Trusted refs are `main` and the temporary integration branch `codex/photo-video`; pull-request workloads, forks and other workflows are denied. Its scheduled job becomes active only when the workflow is on the repository's default branch. Merge the tested PR to activate recurring conversion. Private downloaded photos and videos stay on the ephemeral runner; they are not printed in logs, committed or uploaded as public artifacts. A short-lived signed upload URL permits one job's output path, not arbitrary storage access.

Owners can read their own conversion status subject to existing MFA rules, but cannot edit publication or lease fields. Revision and lease checks reject output superseded by another edit. Failures retry up to three times; editing photos queues a fresh attempt. The queue trigger is internal, checks authenticated ownership and has no client-callable execute grants.

## LG behavior and verification

LG documents fullscreen video playback as the exception to the consumer-TV screensaver policy: https://webostv.developer.lge.com/develop/guides/screensaver . The video plane fills the viewport at (0,0), without opacity or transforms, following https://webostv.developer.lge.com/faq . OLED UI dimming is supported using Type 2 screensaver configuration. This does not disable TV sleep timers or other power settings, and continuous screensaver suppression still requires physical idle testing on each supported TV.

Validate private uploads through the actual hosted converter, photo removal, settings changes during rendering, URL renewal without video restart, looping, hidden/foreground playback, pairing retention, and an idle interval longer than the TV's usual screensaver timeout. Automated checks cover owner isolation, publication permissions, queue invalidation, stale output, cryptographic workload identity, signed video scope, playback lifecycle and download races.

