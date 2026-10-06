# Guided property setup

Properties brings together listing clocks/limits, nightly rates, guest welcome/contact, house rules, personalization, TV registrations and enabled lock assignments. A compact setup card is also available in Overview. Progress is computed from saved owner-scoped data, not a persistent completion flag, so changes and expired registrations can return a step to Needs setup.

Personalization requires the saved toggle plus the exact `{{guest}}` title placeholder used by the TV renderer. Expired, revoked and unclaimed screen registrations are excluded. Lock assignments only count enabled locks owned by the same host. Saving these seven steps does not prove channels are connected, a TV is online, or door codes are installed.

Actions preserve the selected property in Guest Experience, Pricing, the new booking form and lock-assignment form. Optional photo/music summaries read minimal photo metadata rather than object paths or signed image URLs. House rules, contact details and uploaded photos remain in their existing private tables. No schema or provider configuration changes are introduced.

Validation covers related-record owner isolation, screen expiration/pairing, disabled/unassigned locks, malformed listing settings and personalization placeholders.
