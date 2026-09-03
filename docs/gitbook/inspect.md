# Inspect

**Who:** A wallet, protocol, marketplace, or human who must decide whether to let an agent act.  
**URL:** [og-agentseal.vercel.app/inspect](https://og-agentseal.vercel.app/inspect)  
**Auth:** None. No wallet. No API key.

Inspect is the read path. It never issues seals, never moves funds, and never reconstructs a system prompt.

## Inputs

You must supply **both**:

| Input | Rule |
| --- | --- |
| ERC-8004 agent ID | Positive decimal, fits `uint256` |
| Implementation hash | `0x` + 64 hex characters |

There is no “latest seal for this agent.” If you omit the hash, the API returns `400`. That is intentional: a dapp must bind the hash of the code it will run.

Live fixtures on the page:

- **Atlas-0G · sealed** — agent `3522746`
- **Rogue-0G · rejected** — agent `3524303`

## What the UI does

1. The passport starts empty: “Awaiting inspection.” Proof chain waiting: Identity → Version → Evidence → Gate.
2. You submit ID + hash (or click a fixture).
3. The server, in parallel:
   - `ownerOf` / `tokenURI` on the ERC-8004 Identity Registry
   - `validateSeal` on AgentSealRegistry
   - `canExecute` on AgentGate
4. The card shows the aggregate:
   - Atlas: **Safe to integrate**, Gate **PASS**, 100/100, 15/15, evidence root, days remaining
   - Rogue: **Integration blocked**, Gate **REJECT**. The identity exists; that is not enough

## Same decision without the UI

HTTP (see [API overview](api-overview.md)):

```bash
curl "https://og-agentseal.vercel.app/v1/agents/3522746/gate?implementationHash=0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08"
```

TypeScript ([SDK](sdk.md)):

```ts
const passport = await client.verifyAgent({ agentId, implementationHash });
if (!passport.safeToIntegrate) throw new Error(passport.validation.status);
```

Solidity ([AgentGate](onchain.md)):

```solidity
require(gate.canExecute(agentId, versionHash), "not certified");
```

Treat any non-2xx HTTP response as **not allowed**.
