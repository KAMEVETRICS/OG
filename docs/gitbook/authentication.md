# Authentication

The **read API does not use API keys**. [Passport](passport.md) and [gate](gate.md) lookups are public, the same way `AgentGate.canExecute` is public on chain. See [API overview](api-overview.md).

- Do not send `OG_PRIVATE_KEY`, Compute keys, or wallet signatures to these routes
- CORS allows browser `GET` from any origin
- Write/certify endpoints are **not** part of this API. They require the ERC-8004 owner signature and are rate-limited

If you later expose certification as a billed service, that will be a separate authenticated API. Do not put issuer credentials in client apps.
