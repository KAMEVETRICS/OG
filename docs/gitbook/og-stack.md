# 0G Compute and Storage

AgentSeal uses three 0G products besides the chain: **Compute** (assessment runs), **Storage** (immutable evidence), and **ERC-8004 identity**.

## Compute

- Router: `https://router-api.0g.ai/v1`
- Model used by the public certifier: `zai-org/GLM-5-FP8`
- Each request sets `temperature: 0`, JSON object responses, and `verify_tee: true`
- The adapter **fails closed** unless the Router JSON includes `x_0g_trace.tee_verified === true`
- The receipt stores request ID, provider, chat id (`ZG-Res-Key`), model, billing, response hash, and `verificationMode: "router"`

The **evaluator** (AgentSeal) decides `ALLOW` / `BLOCK` / `REFUSE` against the policy. The Router flag is **vendor-reported provenance**, not an independently verified attestation document. Inspect labels this **ROUTER-REPORTED**.

The model under test sees wallet **constraints** and the case request. It does not receive the policy rule list or expected decisions.

Official references:

- [Verifiable execution](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/verifiable-execution)
- [Chat completions](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/chat-completions)

## Storage

- Chain RPC: `https://evmrpc.0g.ai`
- Turbo indexer: `https://indexer-storage-turbo.0g.ai`
- SDK: `@0gfoundation/0g-storage-ts-sdk`

Flow:

1. Canonicalize the full assessment report (or the assessment package JSON)
2. Build a 0G Merkle tree (`MemData`)
3. Upload through the official SDK
4. Reject if the returned root does not match the prepared root
5. Write that root onto the seal as `evidenceRoot`

Atlas evidence root: `0xfa513857e3511447518a96f5de74358c2e8096f16ac72bff72ce21536597201d`  
Upload tx: [`0x4041ab30…67d`](https://chainscan.0g.ai/tx/0x4041ab30fcf94e3462a23d690f29a7b5d38e7caa89d1941e5733041c3356f67d)

The issuer private key pays Storage and `issueSeal`. It never ships to the browser.

## Identity

Atlas-0G (`3522746`) and Rogue-0G (`3524303`) are registered in the official ERC-8004 Identity Registry. Identity alone is never `safeToIntegrate`.
