# Security

The public API is designed so untrusted clients can query it.

## Input rules

- Agent IDs: `^[1-9][0-9]{0,77}$` then `BigInt`, rejected above `2^256 - 1`
- Implementation hashes: exactly 66 characters, `0x` + 64 hex, then lowercased
- Query values: single occurrence, max 256 chars, no NUL/CR/LF
- JSON bodies on other routes: size-capped; `__proto__`, `prototype`, and `constructor` keys rejected
- Metadata returned from chain is clipped (name, description, service URLs). Only `https` service endpoints are echoed

User input is never concatenated into SQL, shell commands, or RPC URLs. Database access uses bound parameters. Implementation hashes are not used as file paths except as already-validated hex keys.

## Output rules

- `safeToIntegrate` is false unless identity, seal, and gate all pass
- RPC errors become `503` with a generic message (no stack, no RPC payload)
- `tokenUri` is truncated
- Cache-Control on successful reads is short (`max-age=15`)

## Write-path rules

- Unsigned certification challenges are not stored. The owner signature is verified against the current ERC-8004 `ownerOf` before any row is inserted.
- Daily owner/global quotas and the queued insert run in one Postgres function.
- Advance and seal issuance re-check `ownerOf`. A transferred identity cannot finish someone else's job.
- Certify does not fetch assessment packages over HTTP. Packages come from the signed request body or from Neon.
- Per-IP quotas apply to challenge/create/list. Public verify uses an in-process limiter so Inspect still works without a database.

## What this API will not do

- Reconstruct a system prompt from a hash
- Issue or revoke seals
- Accept browser-supplied package URLs for verification
- Trust `Host` or unvalidated origins for write challenges (write routes use `SITE_ORIGIN`)
- Treat Router `tee_verified` as an independently verified hardware attestation
