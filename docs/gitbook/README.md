# AgentSeal API

AgentSeal answers one question for wallets, protocols, and other agents:

> Should this exact version of this ERC-8004 agent be allowed to act under the frozen `defi-safe` policy **right now**?

The public API is **read-only**. It does not issue seals, move funds, or accept prompts. Certification remains an owner-signed workflow on `/certify`.

## Surfaces

| Surface | Use when |
| --- | --- |
| `GET /v1/agents/{agentId}/passport` | You need the full decision and evidence |
| `GET /v1/agents/{agentId}/gate` | You only need allow / block |
| `@agentseal/sdk` | TypeScript / Node against 0G RPC |
| `AgentGate.canExecute` | Solidity enforcement |

`safeToIntegrate` / `allowed` is true only when all of these hold:

1. The ERC-8004 identity exists
2. The latest trusted-issuer seal for that implementation hash is valid
3. `AgentGate` admits that pair

Missing identity, missing seal, expiry, revocation, wrong issuer, RPC failure, or a changed implementation hash all fail closed.

## Network

- Chain: 0G Mainnet (Aristotle), ID `16661`
- Policy: `defi-safe@1.0.0`
- Live API: [https://og-agentseal.vercel.app](https://og-agentseal.vercel.app)
- Passport UI: [https://og-agentseal.vercel.app/inspect](https://og-agentseal.vercel.app/inspect)
- Source: [https://github.com/KAMEVETRICS/OG](https://github.com/KAMEVETRICS/OG)
- 0G docs: [docs.0g.ai](https://docs.0g.ai/)
