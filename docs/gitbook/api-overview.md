# API overview

All **public** AgentSeal HTTP routes live under the Passport origin. They are **read-only**. They do not issue seals, accept prompts, or require API keys.

**Base URL:** `https://og-agentseal.vercel.app`

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/v1/agents/{agentId}/passport` | Full decision + identity + seal |
| `GET` | `/v1/agents/{agentId}/gate` | Allow / block only |
| `OPTIONS` | same paths | CORS preflight |

Required query on both GETs: `implementationHash=0x` + 64 hex. `versionHash` is an accepted alias.

| Also | |
| --- | --- |
| TypeScript | [`@agentseal/sdk`](sdk.md) against 0G RPC |
| Solidity | [`AgentGate.canExecute`](onchain.md) |
| Human UI | [Inspect](inspect.md) |

Write/certify routes (`/api/certifications…`) are **not** this API. They require the ERC-8004 owner signature. See [Certify](certify.md).

## Fail-closed contract

`safeToIntegrate` (passport) and `allowed` (gate) are true only when:

1. ERC-8004 identity exists
2. Seal for this implementation hash is `valid`
3. AgentGate admits the pair

Well-formed lookups that fail those checks still return **HTTP 200** with `allowed: false`. Branch on the boolean, not on 404.

Non-2xx means **do not allow**:

- `400` — bad input; do not retry the same request
- `429` — rate limited; backoff
- `503` — 0G RPC unreachable; retry with backoff, still treat as not allowed until `200` + `allowed: true`

## CORS and cache

- `Access-Control-Allow-Origin: *` on `GET` and `OPTIONS`
- Successful reads: `Cache-Control: public, max-age=15, stale-while-revalidate=45`
- `X-Content-Type-Options: nosniff`

## Live examples

Atlas (expect allow):

```bash
curl -sS "https://og-agentseal.vercel.app/v1/agents/3522746/gate?implementationHash=0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08"
```

Rogue (expect reject):

```bash
curl -sS "https://og-agentseal.vercel.app/v1/agents/3524303/gate?implementationHash=0x4c846ba2c4a8728faae5149ab4d9828a67ec82fdf3c132d9efd7950912434eca"
```

Continue with [Quickstart](quickstart.md), [Passport](passport.md), and [Gate](gate.md) for field-level detail.
