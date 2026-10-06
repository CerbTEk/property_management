# Native lock integrations

Decision, October 6, 2026: prefer direct manufacturer APIs so customers can connect accounts in Treestand without managing backend credentials or buying a separate connector subscription. Seam is an optional fallback for other brands; TTLock never uses Seam. Removing an intermediary does not guarantee zero manufacturer fees. Do not market unsupported models or pending integrations as working.

| Brand | Verified direct route | Activation dependency | Current Treestand implementation |
| --- | --- | --- | --- |
| TTLock | Approved developer app, customer app-account token grant | CerbTek client ID/secret and server encryption key; customer sign-in | Owner-scoped sign-in, encrypted tokens, refresh, disconnect and read-only inventory; physical code automation pending |
| Schlage | Schlage Home API, manufacturer account linking | Business onboarding questionnaire, approval, registered callback and application credentials; confirm fees | Optional Seam inventory; native not implemented |
| igloohome | iglooconnect authorization-code flow for other account owners | Business partnership, registered HTTPS callback and issued client credentials; confirm fees | Optional Seam inventory; native not implemented |
| Tedee | Cloud API, OAuth authorization code with PKCE | Register public application for client ID; online bridge, keypad capability and fees to verify | Optional Seam inventory; native not implemented |
| Yale / August | Manufacturer web API partnership | Paid developer program; pricing and model/region coverage need agreement | Optional Seam inventory; native not implemented |
| Nuki | Web API; commercial authorization/webhooks access to verify | Manufacturer program and exact access terms | Optional connector inventory; six-digit 1–9 PIN rule conflicts with exact phone-last-four |
| Kwikset | Manufacturer lists integrations, but public direct onboarding not verified | Obtain approved route for exact Halo or other model; no undocumented API assumptions | Optional Seam inventory; native not implemented |
| Lockly | Public direct API onboarding not verified | Manufacturer confirmation of API, customer authorization and custom scheduled PIN support | Optional Seam inventory; native not implemented |

## Delivery order

1. Activate and physically validate TTLock, which is the owner's installed hardware. Keep four-digit phone suffixes including leading zeros. Confirm online gateway, actual supported PIN version, scheduled writes, receipts, cancellation and checkout cleanup before replacing existing automation.
2. Pursue Schlage and igloohome commercial access, and Tedee application registration. Build approved OAuth callbacks with short-lived, single-use, owner-bound state; use PKCE where supported and required. Store tokens server-side, refresh without losing tenant identity and allow disconnect in-app. Do not request unnecessary unlock or account-deletion permissions.
3. Confirm Yale/August costs and Kwikset/Lockly access. Decide whether manufacturer fees can be included in Treestand's commercial pricing. Do not promise fee-free support before terms are known.
4. For every adapter, import manufacturer-authorized devices, verify exact model/keypad/gateway capabilities, test leading zeros and code conflicts, then implement durable per-lock provisioning, edits, expiry, cancellation and reconciliation. Only mark access installed after a provider receipt and state verification. Never switch provider or create codes silently when migrating.

Clients should see Connect, manufacturer authorization, listing assignment and connection health. Platform app credentials belong to CerbTek, configured once. Customer credentials must never be placed in deployment secrets or shared across tenants.

## Manufacturer sources checked October 6, 2026

- TTLock: https://euopen.ttlock.com/doc/oauth2 and https://euopen.ttlock.com/doc/oauth2/refreshToken
- Schlage: https://developer.allegion.com/en/products/schlage-home/getting-started.html and https://developer.allegion.com/en/products/schlage-home/best-practices.html
- igloohome: https://docs.igloohome.co/home/getting-started-iglooconnect
- Tedee: https://tedee-tedee-api-doc.readthedocs-hosted.com/en/latest/howtos/authenticate.html and https://tedee-tedee-api-doc.readthedocs-hosted.com/en/latest/howtos/begin-integration.html
- Yale/August: https://developer.august.com/ (explicit paid program)
- Nuki: https://docs.nuki.io/guide/overview/ and https://docs.nuki.io/guide/overview/concepts/
- Kwikset: https://www.kwikset.com/smart-locks/works-with (partner list; not API onboarding evidence)

Commercial approvals, provider application credentials and hardware tests have not been completed by this document. No vendor application or partnership email has been sent as part of this change.
