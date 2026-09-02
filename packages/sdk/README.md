# @agentseal/sdk

Read ERC-8004 identity, AgentSeal certification, and AgentGate admission directly from 0G mainnet.

```ts
import { AgentSealClient, ATLAS_0G } from "@agentseal/sdk";

const client = new AgentSealClient();
const passport = await client.verifyAgent({
  agentId: ATLAS_0G.agentId,
  implementationHash: ATLAS_0G.implementationHash,
});

console.log(passport.safeToIntegrate); // true while the seal is current
```

The client is read-only, accepts a custom ethers `Provider`, and fails closed: an agent is safe to integrate only when its ERC-8004 identity exists, its policy-specific seal is valid, and AgentGate admits the exact implementation hash.

HTTP equivalent (no SDK, no API key):

```bash
curl "$BASE/v1/agents/3522746/gate?implementationHash=0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08"
```

See the [AgentSeal API docs](https://agentseal.gitbook.io/agentseal-docs/).
