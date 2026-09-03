# Contracts

All addresses are on **0G mainnet**, chain ID `16661`.

| Contract | Address | Deploy |
| --- | --- | --- |
| ERC-8004 Identity Registry | [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://chainscan.0g.ai/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) | Official 0G |
| AgentSealRegistry | [`0xEEB2c6bD3249647941aEc2D96dD9067594dbc4a2`](https://chainscan.0g.ai/address/0xEEB2c6bD3249647941aEc2D96dD9067594dbc4a2) | [`0x9b78…c37c`](https://chainscan.0g.ai/tx/0x9b78db2337753b9fd12e81729ea5d57ee027c368e7795a489eb13db19600c37c) |
| AgentGate | [`0x78f63314330FbEe998dDEBB89A27cD922DAcD11d`](https://chainscan.0g.ai/address/0x78f63314330FbEe998dDEBB89A27cD922DAcD11d) | [`0x54ec…2815`](https://chainscan.0g.ai/tx/0x54ec76d4d9ee2a67235a883a1367036762b425f803f6fa985f65b4346a982815) |

Trusted issuer (pays Storage and `issueSeal`): `0xaD55ddee566c2ACEa8d3f491248BdAC5e58Ed9c0`.

## AgentSealRegistry

Authorized issuers only. Each seal stores:

- `agentId`, `versionHash`, `policyHash`, `evidenceRoot`
- `safetyScore`, `passedChecks`, `totalChecks`, `criticalFailures`
- `issuedAt`, `expiresAt`, `issuer`, `revoked`

`issueSeal` rejects incomplete or failing candidates (zero hashes, `passedChecks != totalChecks`, any critical failure, score > 100, already expired, caller-supplied issuer or issuedAt). The contract sets `issuer` from `msg.sender` and `issuedAt` from `block.timestamp`.

`validateSeal(agentId, versionHash, policyHash, minimumScore, trustedIssuer)` returns:

`Valid | Missing | Revoked | Expired | WrongIssuer | CriticalFailure | ScoreTooLow`

Latest seal is keyed by `keccak256(abi.encode(agentId, versionHash, policyHash))`, optionally scoped to a trusted issuer.

## AgentGate

Thin, immutable integration example. Policy hash, minimum score (`85`), and trusted issuer are fixed at deploy.

```solidity
function canExecute(uint256 agentId, bytes32 versionHash) public view returns (bool) {
    return registry.isCompliant(
        agentId,
        versionHash,
        policyHash,
        minimumScore,
        trustedIssuer
    );
}
```

A protocol that wants `defi-safe@1.0.0` can call this Gate. A protocol that wants a different policy deploys its own Gate or calls Registry directly.

Contracts should use [on-chain AgentGate](onchain.md), not the HTTP API.
