# TypeScript SDK

Part of the [public API](api-overview.md) family: same fail-closed rule, no HTTP hop.

`@agentseal/sdk` talks to 0G RPC directly. Use it in Node backends when you do not want an extra HTTP hop.

```ts
import { AgentSealClient, ATLAS_0G } from "@agentseal/sdk";

const client = new AgentSealClient({
  rpcUrl: process.env.OG_RPC_URL, // optional; defaults to https://evmrpc.0g.ai
});

const passport = await client.verifyAgent({
  agentId: ATLAS_0G.agentId,
  implementationHash: ATLAS_0G.implementationHash,
});

if (!passport.safeToIntegrate) {
  throw new Error(`Agent rejected: ${passport.validation.status}`);
}
```

The HTTP API is a sanitized JSON wrapper around this client. Keep `OG_RPC_URL` server-side. Never ship issuer or Compute keys with the SDK; it is read-only.
