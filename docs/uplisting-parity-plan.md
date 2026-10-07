# Uplisting coverage and Treestand delivery plan

Reviewed October 5, 2026. Scope: publicly documented Uplisting offerings, add-ons, beta features and integration categories; compared with the actual Treestand source and deployment. This is a requirements audit, not a claim that parity is implemented or that every provider will approve access. Gill confirmed successful Treestand sign-in on October 5. His Uplisting account-specific enabled features and workflow settings still need an inventory/export.

## Delivery order

P0: replace Gill's two-listing workflow without losing bookings, prices, WelcomeScreen updates or timed door access. P1: broader host operations and guest experience. P2: commercial property-manager features and developer ecosystem. Roadmap-only Uplisting products are tracked separately.

Status: Partial means local functionality exists but not complete Uplisting parity. Missing means no working implementation. Partner-dependent means implementation also requires confirmed provider capabilities, permission, credentials and terms. All statuses below are as of this review.

| Capability | Treestand today | Required implementation / dependency | Priority |
|---|---|---|---|
| Host login and independent accounts | Implemented; Gill confirmed login | Verify account recovery, logout, session expiry and cross-account behavior in the live app | P0 |
| Property and individual-room management | Partial: name, rates, occupancy, stay rules, timezone and check-in/out | Edit full listing content, amenities, photos, house rules and channel mappings | P0 |
| Airbnb / Booking.com / Vrbo channel manager | Missing; partner-dependent | Hospitable application is submitted, not approved. Confirm each channel's reservation, pricing, availability, restrictions and messaging scopes; implement adapters, refresh, reconcile and disconnect | P0 Airbnb; P1 others |
| Booking import, modifications and cancellations | Partial: manual create/cancel only | Preserve external IDs, revisions, status, financial details, timezone and cancellation events; support safe amendments | P0 |
| Multi-calendar and bulk edits | Partial: month view and listing filter | Listing-row calendar, reservation detail, bulk rates/restrictions, channel rates and sync-state display | P0 |
| iCal connections | Missing | Authenticated feed administration, validated import/export, refresh state and duplicate detection. iCal is not price or messaging parity | P1 |
| Unavailable dates / owner stays | Missing | Blocks separate from reservations, editable reasons and provider propagation | P0 |
| Minimum stay, booking window, advance notice | Partial: base minimum stay | Date/channel rules, booking horizon and lead-time validation | P0 |
| Closed arrival/departure, buffer nights, gap-night rules | Missing | Day-of-week and date overrides; explicit precedence; reflect channel-specific limitations | P1 |
| Linked listings | Missing | Shared inventory dependencies that block conflicting parent/child listings atomically | P1 |
| Multi-unit inventory | Missing | Unit counts, allocation, reassignment and channel inventory reconciliation; separate from two independently priced rooms | P2 |
| Base rates and spot prices | Partial: weekday/weekend and one-day overrides | Date ranges, bulk edits, history and authoritative provider acknowledgment | P0 |
| Channel markups / smart rates | Partial: one non-negative listing markup | Channel-specific markup/markdown, commission basis, rounding and displayed channel rate | P0 |
| Extra guest fees, cleaning fees, discounts and taxes | Missing | Itemized quote snapshots and configurable fee/tax rules; channel-specific applicability | P1 |
| Last-minute pricing rules and dynamic-pricing connections | Missing; partner-dependent for external services | Lead-time rules, precedence, audit history and approved external rate feed | P1 |
| Unified inbox | Missing: saved templates are not an inbox | Booking-linked threads, channel identity, incoming events, attachments where supported, unread/assignment state and send receipts | P0 |
| Scheduled guest messaging and enquiry responder | Missing | Event/time rules, variables, conditions, deduplication, cancellation suppression, retries and delivery audit | P0 |
| AI messaging / knowledge center | Missing | Property-scoped manuals/Q&A, grounded drafts, review, feedback and measured confidence. Automatic-send behavior must be explicitly configured and validated | P1 |
| Two-way SMS and email | Missing; provider-dependent | Dedicated delivery routes, inbound handling, consent, opt-out and delivery/cost tracking | P1 |
| Automated reviews and review requests | Missing; channel-dependent | Templates, eligibility windows, owner approval options and supported review API actions | P1 |
| Timed TTLock codes | Missing; provider-dependent | Account authorization, gateway discovery, lock mapping, unique per-reservation code lifecycle, buffers, changes, cancellation and checkout expiry | P0 |
| Shared entrance and room-specific locks | Missing | Many-to-many property/lock mapping and concurrent guest schedules; cancellation must preserve other guests' access | P0 |
| Lock health and other lock brands | Missing; device/provider-dependent | Online/battery/status telemetry where supported, unsynced alerts, revoke/disconnect; individual brand adapters require validation | P0 health; P2 brands |
| WelcomeScreen feed | Missing; provider-dependent | Listing/device mapping and minimum guest/stay data; create, change, cancel and checkout updates; monitor acknowledgments | P0 |
| Cleaning scheduler and action list | Missing | Turnover tasks from booking events, cleaner assignment, permissions, notifications, completion and reassignment; ad hoc work without dummy bookings | P1 |
| Direct booking website and embedded booking widget | Missing: public landing page is not a booking engine | Property pages, search/availability, quotes, checkout holds, confirmed payment events, booking creation and guest confirmations | P1 |
| Website customization and marketing | Missing | Host branding/domain, content editing, responsive templates, analytics and conversion events; not a clone of a particular builder | P2 |
| Guest payment links and installment plans | Missing; payment-provider-dependent | Host-owned payment account, schedules, due balances, receipts, failure handling, refunds and reconciliation | P1 |
| Security deposits / Protect equivalent | Missing; payment-provider-dependent | Consent, authorize/capture/release states, supported hold periods, claims evidence and dispute handling; no guaranteed damage coverage | P1 |
| Electronic rental agreements | Missing | Versioned per-property/channel terms, signature evidence, signed PDF, reminders and restricted document access | P1 |
| Guest identity verification | Missing; specialist-provider-dependent | Hosted verification flow, result webhooks, consent and retention; do not store raw identity documents by default | P1 |
| Upsells | Missing; Uplisting documents beta availability | Property offers, eligibility, guest checkout, order status, fulfillment/refunds and separate revenue tracking | P2 |
| Staff, cleaners and client/owner portals | Missing: current access is individual owner only | Organization memberships, invitations, property-scoped roles and restricted owner calendar/access | P1 staff; P2 clients |
| Owner statements and management fees | Missing | Expense ledger, formulas, attribution across months, invoice/payout statements, review/export and auditability | P2 |
| Reports and performance insights | Partial: basic counts and JSON backup | Booking/guest/occupancy/revenue reports, ADR, filters, financial breakdowns, CSV exports and saved reports | P1 |
| REST API, webhooks and MCP access | Missing | Scoped authorization, authenticated events, rate limits, revocation, docs and tenant-safe tools. Uplisting's API alone is not an independent replacement | P2 |
| Mobile experience | Partial: responsive web UI | Test phone workflows; installable app and notifications as needed. Native app parity is not established from the empty public mobile help category | P1 |
| Onboarding, migration and customer support | Missing as a commercial service | Import validation, documentation, support queue, incident response, backups/recovery and honest support coverage | P0 migration; P2 service |
| Pro website / multilingual websites | Uplisting pricing labels these coming soon | Optional separate roadmap; do not count as current feature parity | Future |

## Integration ecosystem boundary

Gill requested an owned WelcomeScreen-style module as part of Treestand on October 5. Screenshots show display configuration (personalized welcome, media, location/weather, branding, language, check-in/out, operating hours, WiFi/contact, QR links and recommendations), TV management, guidebooks, store/monetization, AI messaging, guest lists, team users and PMS sync for listings/reservations/chat. Existing Uplisting integration is shown active. No screenshots, WiFi values, addresses or guest details belong in this public repository. Build a Guest Experience workspace plus a separate device-paired TV player and mobile guidebook; linking out to WelcomeScreen is not equivalent. TV platforms/player support, assets/licenses, weather, commerce and AI require their own verification. Do not disconnect the existing integration until the replacement player passes actual-device testing.

Uplisting lists many third-party integrations. Matching every logo requires separate technical and commercial validation, not just matching the core feature list. Track adapters by category: channels/distribution; dynamic pricing; locks/access; welcome displays and guidebooks; cleaning/maintenance; bookkeeping/owner payouts; identity, screening and damage protection; guest WiFi/marketing; analytics/ads; guest communications/AI; automation connectors; concierge/upsells and EV charging. Initial adapters are Airbnb through an approved route, WelcomeScreen and TTLock. Additional providers are evaluated when requested or required by a customer. Insurance/damage coverage, cleaner marketplaces and human support are services, not capabilities we can reproduce solely in application code.

## Acceptance gates before replacing Uplisting

1. Import both actual listings, future reservations, blocks, current rates, rules, templates and lock mappings. Compare counts and samples; preserve an export and rollback plan.
2. Exercise new booking, amendment, cancellation, back-to-back stays and simultaneous bookings. Duplicate/out-of-order events must not double-book, resend messages or create extra lock codes. Reconciliation must identify missing events.
3. Verify channel rate/availability writes are acknowledged and match the intended price, including markup and restrictions. Check local calendar and OTA calendar against each other.
4. Verify WelcomeScreen on actual devices for both rooms after create/change/cancel/checkout. Minimize guest data and restrict access.
5. Verify a timed code on a designated test lock with the WiFi gateway, room assignment and shared entrance; test timezone/DST, early/late buffers, expiry, cancellation, offline recovery and overlapping guests. Choose one automation writer per production lock during cutover.
6. Confirm guest message scheduling, delivery, suppression after cancellation, and room-correct access instructions. No extra guest sends during import or replay.
7. Validate isolation, recovery, audit history and failure alerts. Successful sign-in alone does not validate authorization or all operational workflows.
8. Observe a complete stay/turnover cycle, reconcile provider bills and approve the cutover. Keep Uplisting active until the gates pass; cancellation remains a separate action.

## Architecture needed for parity

The existing React client and Supabase tables are a foundation. Add an authenticated server integration layer, server-held provider credentials, event journal, durable outbox/jobs, signatures/replay protection, external-ID mappings and reconciliation. Model availability blocks and resource inventory before linked/multi-unit expansion. Snapshot booking prices rather than recomputing historical revenue from current rates. Add organization/property membership before staff/client access; extend RLS and synthetic cross-tenant tests with each feature. Payments and identity checks use hosted provider flows. External operations require explicit success states and visible failure handling.

## Cost gate

Gill's stated Uplisting cost is about $130/month, not a verified current invoice. Calculate savings against additional database compute, Webflow hosting/workspace costs, booking connectivity, SMS/email, AI, lock-provider fees, verification and payment processing. Provider terms and account-specific billing are unconfirmed. Do not promise full ecosystem cost coverage yet.

## Source notes and ambiguities

Public sources describe available capabilities, not Gill's purchased add-ons. Uplisting's general feature page says no booking commission while its current pricing page also offers commission-based plans. Its smart-lock help article and current pricing page show different charging structures. AI help includes both review-only language and confidence-based automatic sending. Confirm account-specific terms and behavior rather than treating those contradictions as requirements. Pricing labels Pro and multilingual websites coming soon; upsells and AI documentation describe beta status.

## Primary sources

- Feature overview: https://www.uplisting.io/features
- Current plans/add-ons/roadmap: https://www.uplisting.io/pricing
- Integrations directory: https://www.uplisting.io/integrations
- Availability: https://support.uplisting.io/en/category/availability-settings-1hh1s00/
- Pricing rules: https://support.uplisting.io/en/category/pricing-settings-1s4ukk3/
- Communication: https://support.uplisting.io/en/category/messaging-70eqrw/
- AI details: https://support.uplisting.io/en/article/ai-messaging-mrjtkg/
- Operations: https://support.uplisting.io/en/category/operations-y639hn/
- Smart locks: https://support.uplisting.io/en/article/automate-guest-access-with-uplisting-smart-locks-16g6006/
- Multi-units: https://support.uplisting.io/en/article/multi-units-hb3deo/
- Reporting: https://support.uplisting.io/en/category/reports-qjb5tr/
- Advanced reporting: https://support.uplisting.io/en/article/kick-start-guide-to-advanced-reporting-thuzov/
- Upsells beta: https://support.uplisting.io/en/article/upsells-feature-faq-pp8g26/
- API/webhooks: https://support.uplisting.io/en/article/api-webhooks-vzlowi/
- MCP: https://support.uplisting.io/en/article/uplisting-mcp-server-silb1i/

## Browser guest display update

An owned browser player, named private screen links, 90-day expiry and permanent revocation are implemented. Screens refresh saved room welcome/guide/contact content each minute and clear on request failure. This is a generic guest greeting; booking-timed personalization, physical TV validation and native app packaging remain pending. See [guest display setup](guest-display.md).

## Scheduled welcome personalization

Optional first-name greetings now follow confirmed stays saved in Treestand, using the listing timezone and check-in/checkout times. Generic greetings appear outside the stay or for ambiguous records. Ten automated checks pass, including daylight-saving and same-day turnover. The Airbnb import and physical Android TV installation remain pending.

## One-time TV pairing

Owned screens now accept single-use pairing codes with short expiry. Browser pairing is live after deployment; Android app source supports the same exchange but its APK build is still waiting for a GitHub runner. No WelcomeScreen integration has been removed.

## Manual calendar control update

Listing settings and confirmed manual booking edits are available. Maintenance and owner stays can be blocked and released; the shared database constraint prevents conflicts between bookings and blocks. Blocks are excluded from guest welcomes and active reservation counts. Provider calendar publishing remains pending. Twelve automated checks pass.

## Door-lock planning

Owned lock inventory and room/shared-entrance assignments now support booking access previews with timezone-aware check-in and checkout. A tested server-only TTLock inventory adapter and timed gateway passcode request builder are prepared, without a deployed provider route or credentials. Live passcode provisioning, reconciliation and physical validation remain pending. See [door locks](door-locks.md).

## October 6: automatic turnovers and message preparation

Automatic cleaning and inspection task creation now follows new confirmed bookings, with immutable per-task snapshots of editable property checklists. Existing bookings can be prepared explicitly. Cleaner assignments, staff permissions and reminders remain missing.

Message templates now support editing/archival. Per-property event rules create durable booking-linked plans with rendered variables, booking-change recalculation, cancellation suppression, pause/dismiss controls and clock-change review. Message delivery, incoming threads, unified inbox, provider receipts and automatic-send workers remain missing. No prepared backlog may be flushed automatically on provider activation. See [turnover and message preparation](turnover-and-messaging.md).

## October 6: assignment planning and in-app reminders

Hosts can now maintain a team roster, assign active people to tasks and set property cleaning/inspection defaults for new tasks. Assignment names retain historical snapshots. Deactivated people are flagged on open work. Overview and Operations expose due/overdue/unassigned/seven-day reminders. These are host planning tools, not staff login access or delivered notifications. Invitations, restricted staff workspaces, cleaner acceptance and external reminders remain missing. See [operations assignments](operations-assignments.md).

## October 6: separate staff task workspace

A /staff/ workspace now supports verified-email invitation acceptance, mandatory staff MFA, assigned-task-only reads/updates, work notes, checklist completion and immediate request-level access revocation. In-app new/changed reminders have persistent reviewed receipts and notification preferences. Host records, guest data, pricing and locks remain outside staff access. Invitations are created in-app and the host shares the staff link; invitation/reminder emails and SMS remain disabled pending a dedicated verified sender and outbound transport. See [staff workspace](staff-workspace.md).

Staff invitation and opt-in work-reminder email transport is now prepared with private durable jobs, owner authorization, deduplication, uncertain-outcome handling, signed provider receipts and bounce/complaint suppression. Actual sending remains disabled until a dedicated verified sender, server credentials and webhook are configured. It is host-triggered; automatic reminder scheduling and SMS remain missing. See [staff email](staff-email.md).

## October 6: calendar and operations reporting

The Reports blade now includes listing and monthly booked occupancy, nights, blocks, arrivals/departures, overlapping cancellations and due-date task status, with filtered CSV exports. Listing/calendar/task reads paginate and fail on detected incomplete data. Reports use saved Treestand records, not a connected OTA feed. Revenue/ADR/payout reports still require financial snapshots and reconciliation. See [reports](reports.md).

## October 6: immutable booking charge records

Hosts can save itemized USD accommodation, discount, fees, taxes and channel-fee revisions for confirmed bookings. Changes to booking dates/listing/guest count require review; current rates never rewrite financial history. Reports now include allocated booked charges, taxes, channel fees and fully covered accommodation ADR, with financial CSV exports and explicit missing/stale coverage. Payment collection, refunds, cancellation-fee reconciliation, automatic tax calculation/remittance and payouts remain pending. See [booking financials](booking-financials.md).

## October 6: host-recorded payment/refund ledger

Bookings now records completed payments, linked partial refunds and immutable corrections with duplicate/retry controls. Current agreed charge snapshots provide remaining-balance and overpayment views. Cancelled or stale bookings require settlement review. Reports and CSVs separate dated host-recorded payment/refund totals from allocated booking charges. No money moves and no record claims processor verification. Stripe/channel reconciliation, actual refund actions, cancellation settlement and tax remittance remain pending. See [booking transactions](booking-transactions.md).

## October 6: fees and discount pricing rules

Per-listing cleaning/extra-guest fees, weekly/monthly discounts and last-minute discounts now feed itemized estimates and explicitly reviewed booking charge drafts. Largest eligible accommodation discount wins without stacking. Rule edits are revision checked and never rewrite saved booking amounts. Automatic channel publishing, external dynamic pricing, tax calculation, availability-rule expansion and direct booking checkout remain pending. See [pricing rules](pricing-rules.md).

## Reservation CSV migration increment

Bookings now offers a mapped CSV import into an existing owned listing, with complete preview, stable original IDs, duplicate/change review, calendar conflicts and atomic batches. Imported message drafts remain held for separate delivery review; confirmed imports follow existing turnover/TV/access planning rules. Listing imports, financial migration, automatic provider amendments and actual export-format validation remain pending. See [reservation imports](booking-imports.md).

## Listing CSV migration increment

Properties now supports reviewed basic listing CSV imports and explicit linking to existing listings when all settings match. Immutable original listing IDs appear in the booking-import listing selector. Duplicate/changed records require review and batches save atomically. Financial migration, content/media/dated-price migration and actual source-export validation remain pending. See [listing imports](property-imports.md).
