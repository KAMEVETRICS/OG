# 0G integration decisions

These values and interfaces were checked against the official 0G documentation
on 2026-08-29.

## Compute

The assessor uses the server-side Compute Router at
`https://router-api.0g.ai/v1`. Each request sets `verify_tee: true` and fails
closed unless `x_0g_trace.tee_verified` is exactly `true`. The receipt preserves
the request ID, provider address, `ZG-Res-Key` chat ID, model, billing data, and a
hash of the response.

The MVP initially records Router verification. Independent verification with
`@0gfoundation/0g-compute-ts-sdk` is the next hardening step because the Router's
boolean still trusts the Router to perform the signature check.

- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/verifiable-execution
- https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/chat-completions

## Storage

The evidence adapter canonicalizes the complete assessment report, computes its
0G Merkle root with `MemData`, uploads through the official TypeScript SDK, and
checks that the returned root matches the prepared root before returning a
receipt.

- Mainnet RPC: `https://evmrpc.0g.ai`
- Turbo indexer: `https://indexer-storage-turbo.0g.ai`
- SDK: `@0gfoundation/0g-storage-ts-sdk`

## Chain and identity

- Chain ID: `16661`
- ERC-8004 Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- ERC-8004 Reputation Registry: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`

Network writes require explicit credentials. Local tests never deploy, register
agents, spend tokens, or upload evidence.

