# Airbnb connection readiness

Goal: replace Uplisting entirely with an owned Treestand PMS. No Uplisting connector is planned. Hospitable is an optional connection route with an application pending; direct Airbnb partnership is the intended independent route to evaluate. Neither is connected or approved.

## Requirement and evidence

| Requirement | Current implementation | Remaining evidence/work |
| --- | --- | --- |
| Airbnb API program agreements and security review | No direct access claimed | Obtain NDA, partner terms, commercial authorization and approved scopes; complete Airbnb review |
| Owner authorization and least privilege | Per-owner RLS, same-owner property references, no anonymous host access | Provider OAuth consent, scope mapping and disconnect/revocation before connecting Airbnb |
| MFA | Authenticator enrollment/challenge gate; database restrictive AAL2 policies on all six host tables | User completes enrollment; end-to-end authenticator testing and verified recovery procedures |
| Protect guest information | Device endpoint restricted to room content; optional first-name display only during stay; no host/booking payloads | Provider-specific authorization for guest-display use; retention, deletion/export workflows and privacy notices |
| Secure API use | Server-only privileged credentials; host and device identity separated | Implement only approved endpoints; documented rate limiting, webhook validation and retry/idempotency controls |
| Vulnerability management | Weekly npm audit workflow, database/MFA tests and build checks | Successful hosted runs; quarterly full infrastructure/app scans, OWASP assessment and vendor reviews |
| Incident response and patch deadlines | SECURITY.md records response targets and procedures | Private reporting, alerts, incident coverage, private tracking and response exercise |
| Mandatory API updates | No live API connection yet | Track mandatory releases; implement within six months |
| Commercial/data restrictions | No paid onboarding or Airbnb data advertising | Written partner authorization for subscription model and approved data uses |
| Personnel security | Not verifiable from source code | Verify MFA, individual accounts, device encryption and malware protection |

## Rollout and verification

Deploy the enrollment/challenge interface first, then apply database/host_mfa.sql. Existing password-only sessions must verify MFA to reopen their workspace. No account's authenticator secret is pre-created or stored by development tooling. The enrollment QR/key is shown only inside that user's authenticated setup screen. Abandoned unverified enrollments can be cleared by the setup flow; active factors are never removed there.

Database tests exercise real restrictive policies with missing/AAL1/AAL2 claims: missing and password-only sessions cannot read any host table, cannot insert drafts, and cannot update listings; MFA still cannot bypass another owner's restrictions. MFA flow tests deny invalid codes, provider errors and stale assurance. Guest-device security tests continue independently. Tests do not prove a live authenticator flow or Airbnb approval.

Keep guest-display credentials as a separate least-privilege device mechanism. Requiring a host login on guest TVs would expose unnecessary permissions. Their use with Airbnb-derived data requires evaluation under the approved scopes and agreement.

Source: https://www.airbnb.com/help/article/3418 . This record is implementation evidence and an open-gap register, not certification or a substitute for Airbnb's partner-specific requirements.
