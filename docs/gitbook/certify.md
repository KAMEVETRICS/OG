# Certify

**Who:** The current ERC-8004 owner of an agent.  
**URL:** [og-agentseal.vercel.app/certify](https://og-agentseal.vercel.app/certify)  
**Auth:** Wallet connection, then `personal_sign` of a readable challenge.

Certify is the write path. The issuer key stays on the server. The browser never receives `OG_PRIVATE_KEY` or the Compute API key.

What is assessed: the **pasted system prompt** or **uploaded JSON package**, not the agent’s live HTTP endpoint.

## 1. Connect

1. Connect an EVM wallet. Connection is view-only: AgentSeal looks up your agents and cannot move funds.
2. Accounts are requested **before** any `wallet_addEthereumChain`. Then the app switches to 0G Mainnet (`16661`, RPC `https://evmrpc.0g.ai`).
3. The server lists candidate token IDs from 0G ChainScan, then **re-verifies every ID** with `ownerOf`. ChainScan is discovery only.
4. You can look up an ID manually if it was omitted.

If the stored package already has a current seal, Certify shows **Already sealed** and an Inspect link. Recertify is an explicit “new version” action.

## 2. Compose the package

First time (no stored package):

- Paste the system prompt (max 16 000 characters), or
- Upload a JSON assessment package (max 64 KB)

The server validates schema `1.0`, tool schema in `{swap, approve, transfer, read}`, prompt hash, tool-schema hash, Router config hash, and model revision. The **implementation hash is derived on the server**. Browser-supplied hashes and package URLs are ignored. Certify does not fetch arbitrary HTTPS packages.

Later requests reuse the Neon-stored package for that `(agentId, owner)`.

## 3. Sign — nothing is stored yet

`POST /api/certifications/challenge` is a **read**. It rebuilds the package in memory and returns the challenge message, nonce, request id, and expiry. **No database row.**

The signed message binds: public origin (`SITE_ORIGIN`, never `Host`), chain 16661, agent ID, implementation hash, package URL on this origin, owner, request id, nonce, expiry. It does not authorize transfers.

`POST /api/certifications` reconstructs that same message, verifies the signature against **current** `ownerOf`, then in one Postgres function consumes daily quotas and inserts status `queued`.

## 4. Assessment and issuance

The browser holds a resume token and drives `POST /api/certifications/{id}/advance`. Each hop:

1. Timing-safe compare of SHA-256(token) to the stored hash
2. Re-check `ownerOf`. If the NFT moved, the job is rejected
3. Run policy cases on 0G Compute (15 cases × 3 runs)
4. Build the canonical report. Fail if any critical case failed, any run lacks Router `tee_verified`, or score &lt; 85
5. Upload the report to 0G Storage, `issueSeal`, then confirm `validateSeal` and `canExecute`

States:

```text
queued → assessing → assessed → uploading → issuing → sealed
                   └────────────────────────────────→ rejected
```

Public certification status never includes the prompt, signature, or resume token.

## Limits

Defaults: 2 seals per owner per UTC day, 20 global. Per-IP quotas on list, challenge, and create.

Write endpoints are **not** the public `/v1` API. See [API overview](api-overview.md) for the read API.
