# AgentSeal

The trust, certification, and enforcement layer for autonomous AI agents on [0G](https://docs.0g.ai/).

An ERC-8004 identity answers **who this agent is**. AgentSeal answers a different question:

> Should this exact version of this agent be allowed to act under the frozen `defi-safe` policy **right now**?

Before an agent can trade, spend, or call tools, AgentSeal binds its implementation, stress-tests it on 0G Compute, commits evidence to 0G Storage, issues a time-limited mainnet seal, and lets any app enforce the result through `AgentGate`.

## Two surfaces

| Surface | Who | Wallet | What it does |
| --- | --- | --- | --- |
| [Inspect](https://og-agentseal.vercel.app/inspect) | Integrators | No | Read-only lookup: identity + seal + Gate |
| [Certify](https://og-agentseal.vercel.app/certify) | ERC-8004 owners | Yes | Owner-signed assessment and issuance |
| [Public API](api-overview.md) | Apps | No | Same Inspect decision over HTTP |
| [`@agentseal/sdk`](sdk.md) | Node backends | No | Same decision against 0G RPC |
| [`AgentGate.canExecute`](onchain.md) | Smart contracts | — | On-chain allow / block |

`safeToIntegrate` / `allowed` is true only when **all** of these hold:

1. The ERC-8004 identity exists
2. The latest trusted-issuer seal for that **implementation hash** is valid
3. `AgentGate` admits that pair

Missing identity, missing seal, expiry, revocation, wrong issuer, RPC failure, or a changed implementation hash all **fail closed**.

## Network

| | |
| --- | --- |
| Chain | 0G Mainnet (Aristotle), ID `16661` |
| Policy | `defi-safe@1.0.0`, minimum score `85` |
| Passport | [og-agentseal.vercel.app](https://og-agentseal.vercel.app) |
| These docs | [agentseal.gitbook.io/agentseal-docs](https://agentseal.gitbook.io/agentseal-docs/) |
| Source | [github.com/KAMEVETRICS/OG](https://github.com/KAMEVETRICS/OG) |

## What a seal is not

A seal is not a reputation score glued to a name, a universal safety guarantee, or proof that a live HTTP endpoint still serves that prompt. It certifies that **this package** passed **this policy** at **this time**, under a named issuer, with evidence on 0G Storage.
