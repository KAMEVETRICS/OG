# The problem

Autonomous agents are being given wallets, token approvals, and the ability to call DeFi tools. Identity registries such as ERC-8004 tell you **which agent** you are talking to. They do not tell you whether **this version of its behavior** is allowed to act.

Reputation scores attached to a name fail in three ways:

1. **Version drift.** An agent can behave well on prompt v1.4, then the owner ships a new system prompt or tool schema. The identity NFT is unchanged. The old reputation still applies to new behavior.
2. **No evidence.** “We tested it” is not a Merkle root on 0G Storage and not a struct a contract can `view`.
3. **No enforcement.** A marketplace or wallet still has to trust the agent’s own marketing. There is no `canExecute(agentId, versionHash)` they can call.

AgentSeal is that missing layer: bind an implementation, run a frozen adversarial policy on 0G Compute, commit the canonical report to 0G Storage, issue a time-limited on-chain seal, and let any app fail closed.

See [Architecture](architecture.md) for the trust objects, [Inspect](inspect.md) for the read path, and [Certify](certify.md) for issuance.
