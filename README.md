# AgentSeal

> The trust, certification, and enforcement layer for autonomous AI agents.

Before an agent can trade, spend money, or access tools, AgentSeal binds its exact implementation, stress-tests its behavior through 0G Compute, commits the evidence to 0G Storage, issues a time-limited mainnet safety passport, and lets applications enforce the result through `AgentGate`.

**Live Passport:** [og-agentseal.vercel.app](https://og-agentseal.vercel.app/) · **API docs:** [agentseal.gitbook.io/agentseal-docs](https://agentseal.gitbook.io/agentseal-docs/) · repo [github.com/KAMEVETRICS/OG](https://github.com/KAMEVETRICS/OG)

## Why AgentSeal

An ERC-8004 identity answers “who is this agent?” AgentSeal answers a different question:

> Should this exact version of this agent be allowed to act under this policy right now?

Reputation alone is not enough. An agent can earn trust on version 1.4, then silently change its prompt, model, tools, or runtime. AgentSeal makes every certification:

- **version-bound** — implementation changes invalidate the match;
- **policy-specific** — DeFi safety is not the same as coding or research quality;
- **evidence-backed** — the complete canonical assessment is committed to 0G Storage;
- **time-limited** — seals expire and require reassessment; and
- **composable** — wallets and protocols can enforce the decision onchain or through the SDK.

## Current production status

| | Atlas-0G | Rogue-0G |
| --- | --- | --- |
| ERC-8004 identity | `3522746` on 0G mainnet | `3524303` on 0G mainnet |
| Implementation hash | `0x1d82…da08` | `0x4c84…4eca` |
| Safety score | `100/100` | `7/100` |
| Critical failures | `0` | `10` |
| AgentSeal | Seal ID `1` on the patched Registry, expires `2026-09-09` | Not issued |
| AgentGate | **PASS** for this exact implementation | **REJECT** |

Atlas passed 15 adversarial cases across 45 Router-verified TEE executions. Evidence is on 0G Storage and the version-bound seal is live on the patched Registry. The previous Registry deployment and its seal are archived. The unsafe Rogue fixture accepts policy overrides, secret-extraction prompts, unauthorized transfers, inflated tool amounts, and unlimited approvals; it cannot be certified.

## Architecture

```text
agent implementation + policy
             │
             ▼
     version fingerprint
             │
             ▼
  adversarial assessment ──────► 0G Compute / TEE provenance
             │
             ▼
   canonical evidence report ──► 0G Storage / Merkle root
             │
             ▼
    AgentSealRegistry on 0G mainnet
             │
             ▼
         AgentGate ─────────────► wallet / dApp / agent platform
             ▲
             │
      ERC-8004 identity
```

See [docs/architecture.md](docs/architecture.md) for the complete data flow, trust objects, and TEE boundary.

## 0G integrations

### 0G Chain

The chain stores the minimum state required to enforce trust: agent ID, implementation hash, policy hash, evidence root, score, passed checks, critical failures, issuer, issue time, expiry, and revocation state.

### 0G Compute

Every live assessment request sets `verify_tee: true`. The adapter fails closed unless the Router returns `x_0g_trace.tee_verified === true`, then retains request, chat, provider, model, billing, and response-hash provenance.

TEE provenance proves where and how inference ran. AgentSeal's evaluator separately determines whether the behavior was correct.

### 0G Storage

The storage adapter canonicalizes the complete report, calculates its official 0G Merkle root, uploads it through `@0gfoundation/0g-storage-ts-sdk`, and rejects any returned root mismatch. The live verification script downloads the artifact with proof checking and confirms byte-for-byte equality.

### ERC-8004

Atlas-0G and Rogue-0G are registered in the official 0G mainnet Identity Registry. The SDK requires an identity plus a valid version-specific seal before it can return `safeToIntegrate: true`; identity alone is deliberately insufficient.

## Mainnet proof

Chain ID: `16661`

| Object | Address / transaction |
| --- | --- |
| ERC-8004 Identity Registry | [`0x8004…a432`](https://chainscan.0g.ai/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) |
| AgentSealRegistry | [`0xEEB2…c4a2`](https://chainscan.0g.ai/address/0xEEB2c6bD3249647941aEc2D96dD9067594dbc4a2) |
| AgentGate | [`0x78f6…D11d`](https://chainscan.0g.ai/address/0x78f63314330FbEe998dDEBB89A27cD922DAcD11d) |
| Registry deployment | [`0x9b78…c37c`](https://chainscan.0g.ai/tx/0x9b78db2337753b9fd12e81729ea5d57ee027c368e7795a489eb13db19600c37c) |
| Gate deployment | [`0x54ec…2815`](https://chainscan.0g.ai/tx/0x54ec76d4d9ee2a67235a883a1367036762b425f803f6fa985f65b4346a982815) |
| Atlas registration | [`0xff91…9c3`](https://chainscan.0g.ai/tx/0xff91586c3b25f33189cc188e36d765290355a3472672b76ac49f8c1f2f8689c3) |
| Rogue registration | [`0x6394…a0e6`](https://chainscan.0g.ai/tx/0x6394d854a0bf8d9052a1ca624d6ef23c29da11c32cc85c87a2498cc0a2baa0e6) |
| Evidence upload | [`0x4041…67d`](https://chainscan.0g.ai/tx/0x4041ab30fcf94e3462a23d690f29a7b5d38e7caa89d1941e5733041c3356f67d) |
| Seal issuance | [`0x8a4d…971`](https://chainscan.0g.ai/tx/0x8a4d34b35c3cb7a950492c513eee98b8599bcc69505a0ab34d9c8798ec5fd971) |

Cryptographic references:

```text
Policy hash:         0x5635eef2ec2ab753999901846dc52029f59a751d04d818f19acf1dd33c077ddb
Implementation hash: 0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08
Assessment hash:     0x01bd80fc95efc066953bb97b2e91c5c1b725ae3d3c3b18a64e64fb48d809ac57
0G Storage root:     0xfa513857e3511447518a96f5de74358c2e8096f16ac72bff72ce21536597201d
```

## SDK

`@agentseal/sdk` is a read-only TypeScript package over the ERC-8004 Identity Registry, AgentSealRegistry, and AgentGate.

```ts
import { AgentSealClient, ATLAS_0G } from '@agentseal/sdk';

const client = new AgentSealClient();
const passport = await client.verifyAgent({
  agentId: ATLAS_0G.agentId,
  implementationHash: ATLAS_0G.implementationHash,
});

if (!passport.safeToIntegrate) {
  throw new Error(`Agent rejected: ${passport.validation.status}`);
}
```

The aggregate decision fails closed unless the identity exists, the exact version-specific seal is valid, and AgentGate admits it.

## Public HTTP API

Read-only lookup for other apps. No API key. Same fail-closed rules as the SDK.

```bash
curl "https://og-agentseal.vercel.app/v1/agents/3522746/gate?implementationHash=0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08"
```

```bash
curl "https://og-agentseal.vercel.app/v1/agents/3522746/passport?implementationHash=0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08"
```

`allowed` / `safeToIntegrate` is the integration switch. Full reference: [AgentSeal API docs](https://agentseal.gitbook.io/agentseal-docs/).

## Self-service certification

The Passport includes a `/certify` workflow that can assess an ERC-8004 agent and issue a seal without exposing the issuer key to the browser:

1. Connect the current ERC-8004 owner wallet. AgentSeal discovers candidate agents through 0G ChainScan and verifies every owner against the Identity Registry.
2. Select an owned agent. If it has no registered assessment package yet, upload the package JSON once; later requests resolve the stored version automatically.
3. Sign the scoped one-time challenge. The server derives the implementation hash and never accepts a browser-supplied hash or package URL.
4. The server runs the frozen DeFi safety policy through 45 Router-verified TEE executions. Critical failures cannot be averaged away.
5. Passing evidence is committed to 0G Storage, a seven-day seal is issued on 0G mainnet, and AgentGate is checked before success is shown.

Requests are resumable and stored in Neon Postgres. Per-owner and global daily limits protect the public issuer. See [docs/certification-package.md](docs/certification-package.md) for the package contract, security boundary, API states, and production configuration.

## Run locally

Requirements: Node.js 22.18 or newer and pnpm.

```bash
pnpm install
cp .env.example .env
pnpm test
pnpm typecheck
pnpm assess:demo
pnpm passport:dev
```

Network reads use the public 0G mainnet RPC by default. Compute, Storage, registration, certification, and deployment writes require the corresponding `.env` credentials. `.env` is ignored and must never be committed.

## Deploy on Vercel

1. Import [https://github.com/KAMEVETRICS/OG](https://github.com/KAMEVETRICS/OG).
2. Set **Root Directory** to `apps/passport`. Framework: Next.js. Node.js 22.
3. Redeploy. Inspect, Atlas/Rogue lookup, and `GET /v1/agents/{id}/passport|gate` work against 0G mainnet with no secrets.
4. For `/certify`, add `OG_COMPUTE_API_KEY`, `OG_PRIVATE_KEY`, `OG_RPC_URL`, `OG_STORAGE_INDEXER_RPC`, `OG_COMPUTE_MODEL`, and `ERC8004_IDENTITY_REGISTRY`. Attach Vercel **Storage → Neon** (`DATABASE_URL` is injected automatically). Skip Neon’s comments-app quickstart; AgentSeal creates its own tables on first certify request.
5. Redeploy after adding Storage or env vars. Set `SITE_ORIGIN` to `https://og-agentseal.vercel.app`.

Useful verification commands:

```bash
pnpm deploy:verify
pnpm certify:verify
pnpm sdk:verify
pnpm passport:build
```

## Repository map

```text
apps/assessor/               policy assessment engine and reference agents
apps/passport/               live Agent Passport dashboard
benchmarks/defi-safe/v1/     frozen adversarial policy suite
contracts/src/               AgentSealRegistry and AgentGate
deployments/                 mainnet manifests, identities, and seals
docs/                        architecture, trust model, demo, and submission guide
packages/core/               canonical hashing, fingerprints, and shared types
packages/og-compute/         fail-closed 0G Compute Router adapter
packages/og-storage/         evidence preparation, upload, and verification
packages/sdk/                public TypeScript verification SDK
scripts/                     mainnet deployment, certification, and verification
tests/                       assessment, contract, adapter, and SDK tests
```

## Security model and limitations

- A seal certifies one implementation against one policy at one time; it is not a universal safety guarantee.
- Critical failures cannot be averaged away by low-risk successes.
- `BLOCK` and `REFUSE` are safety-equivalent only when neither carries an executable tool action.
- The current Compute integration retains Router-verified TEE provenance. Independent raw attestation verification is the next hardening step.
- The MVP does not implement subjective slashing, warranties, a challenge market, or a universal score.
- Atlas must be reassessed and issued a fresh seal after expiry.

## Submission resources

- [MVP specification](docs/mvp-spec.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Self-service certification package](docs/certification-package.md)
- [0G integration decisions](docs/0g-integrations.md)
- [2½-minute demo script](docs/demo-script.md)
- [Submission checklist](docs/submission-checklist.md)
- [X announcement draft](docs/x-announcement.md)
- [Public API docs](https://agentseal.gitbook.io/agentseal-docs/)

## License

MIT
