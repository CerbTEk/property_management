# Assignment-based TTLock automation

Each connected host explicitly enables automatic booking codes in Door locks → Connect providers. Consent defaults off and is not inferred from importing a lock. Enabled hosts use their current listing assignments, including multiple room/shared doors, without an operator-maintained device allowlist. Other providers retain their existing separate activation controls.

Only enabled, owned TTLock locks assigned to owned listings are eligible for new codes. Treestand-managed active receipts remain eligible for cleanup after booking/assignment removal. The provider account must still own each device. Existing exact receipt labels and protected code fingerprints prevent adoption, overwriting or deletion of unrelated passcodes.

## Consent and races

Host actions use authenticated identity, the existing MFA policy, a service-only compare-and-set RPC and a consent revision captured at confirmation. Disconnecting or changing the provider identity disables consent. Token refresh does not disable it. Account, booking, listing, lock and assignment changes invalidate in-flight queue revisions.

The runner checks the consent revision before provider access, when execution begins, before the durable checkpoint, and immediately before mutation. Pausing stops changes, including cleanup; previously installed codes retain their original expiry. An already-dispatched provider request cannot be recalled. If consent is withdrawn after the uncertain checkpoint but before sending, the receipt conservatively remains uncertain; re-enabling may require manual review instead of an unsafe automatic retry.

Set TREESTAND_TTLOCK_AUTOMATION_PAUSED=true for a deployment-wide emergency pause. Host consent remains stored. The old TTLOCK_AUTOMATION_TEST_DEVICES / TTLOCK_AUTOMATION_ENABLED test gate no longer controls this production path. Do not set or retrieve credentials as part of rollout.

## Rollout and verification

1. Run npm test, npm run build and npm audit --audit-level=moderate, plus branch CI.
2. Apply database/ttlock_automation.sql after the existing account/access queue schema. This does not enable any host.
3. Deploy smart-lock-connect and treestand-access-runner with all their relative dependencies. Preserve custom request authentication and existing verify_jwt configuration.
4. Publish the matching UI only after checks pass. Enable only the specifically approved host using the versioned setting.
5. Verify existing minute scheduler results and exact installed/revoked receipts. A successful HTTP response or enabled switch alone does not prove installation.
6. Physical keypad testing, changed-stay, cancellation and expiry hardware acceptance remain separate from synthetic automated tests. Do not claim a tested physical result from provider receipts alone.

No booking dates, door assignments, provider secrets, unrelated drafts or other hosts are changed by this rollout. If rollback is necessary, first pause consent for affected authorized hosts; retain all receipts and the schema. Restoring the prior runner must not reactivate stale test allowlists.
