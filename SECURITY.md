# Security reporting and operations

Treestand Manager is a pilot, not an Airbnb-approved integration. Do not submit credentials, guest information or vulnerability details to public GitHub issues. A private reporting channel must be established before public customer onboarding; do not represent that channel as operational yet.

CerbTek's release process requires dependency checks, automated access-control tests and a production build. Weekly GitHub checks audit npm dependencies. Hosted runner availability and workflow outcomes must be monitored; a configured workflow is not evidence of a completed scan. Quarterly application/infrastructure vulnerability scans, OWASP assessment, vendor review and recovery exercises remain required in addition to dependency scanning.

Target patch deadlines from discovery: critical 7 days, high 30 days, medium 90 days, low 180 days. Record discovery date, severity, responsible owner, affected version and remediation evidence in a private issue tracker. Do not publish exploitable details.

For suspected incidents: contain access, preserve relevant private logs, identify affected accounts/data, investigate and document corrective actions. Under an Airbnb API agreement, incidents involving API credentials, scopes/content or regulated data require notification to security@airbnb.com immediately and within one hour of awareness; other incidents within 24 hours. Notify affected data controllers when required. Airbnb can request a root-cause report within five business days. Designated coverage, alerting and response exercises are still pending. No automated incident emails are sent by this repository.

Host access requires verified authenticator MFA and ownership policies at the database, with an explicit user-requested exception for the manual pilot owner. This exception is an open Airbnb readiness gap. Device players use separate expiring, revocable credentials scoped to one room; they never receive host sessions. Privileged provider credentials belong on the server only. Never weaken MFA or ownership policies as an account recovery shortcut. Establish an identity-verified recovery process before customer onboarding. Treestand does not issue authenticator recovery codes.

Personnel systems accessing API data must use individual accounts, MFA, disk encryption, patching and malware protection. These operational controls require verification outside the application.

Reference: https://www.airbnb.com/help/article/3418 (API terms, checked October 5, 2026). Partner-specific agreements determine the final obligations.
