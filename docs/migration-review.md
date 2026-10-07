# Migration reconciliation

The Migration blade compares manually entered source-export counts and USD totals with immutable listing, reservation, charge and completed payment/refund import receipts. Choose the original source and either all owned listings or a single listing. Enter every expected value, including explicit zeros. Compare exports covering the same full imported history; there is no date filter.

Original receipt totals remain separate from the current active ledger. Later booking/listing changes, charge revisions, reversals, additional host entries, missing links, calendar conflicts, missing/stale charges and cancelled stays with recorded net balances appear for review. Imported message holds are counted. Matching empty totals never establishes reservation coverage. Counts alone cannot prove that the correct set of original IDs was migrated.

Expected totals are session-only. Editing inputs or changing scope clears the comparison; refreshing remounts the blade. Refresh failures hide the retained workspace rather than presenting stale figures as current. Workspace reads are paginated, but they are not a transaction-consistent snapshot; refresh near the source-export time and review changes during that interval.

Download reconciliation report produces JSON containing counts, amounts, scope, timestamps, record identifiers and static issue descriptions. It excludes guest names, notes, phone suffixes, message content, door codes and full import snapshots. Identifiers still belong to the host's records and should be shared intentionally.

All financial amounts are host-recorded source evidence, not processor-verified payments. This screen changes no records, message holds, connections or devices. No new schema or migration is required.

Live booking amendments/cancellations, channel price/availability publishing, guest message delivery, physical lock behavior and physical guest TV behavior remain **Not verified**. There is no checkbox override and cutoverReady stays false. Do not disconnect the previous system based on matching totals.

Validation includes owner/source/listing isolation, explicit expected values, empty scopes, drift, conflicts, malformed and missing receipts, corrected ledger totals, cancelled settlement and exclusion of private fields from downloaded reports.
