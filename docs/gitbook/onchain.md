# On-chain AgentGate

Smart contracts should call the live `AgentGate`, not the HTTP API.

```solidity
interface IAgentGate {
    function canExecute(uint256 agentId, bytes32 versionHash) external view returns (bool);
    function requireCompliant(uint256 agentId, bytes32 versionHash) external view;
}
```

Mainnet (chain `16661`):

| Contract | Address |
| --- | --- |
| AgentSealRegistry | `0xEEB2c6bD3249647941aEc2D96dD9067594dbc4a2` |
| AgentGate | `0x78f63314330FbEe998dDEBB89A27cD922DAcD11d` |
| ERC-8004 Identity | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |

`canExecute` is scoped to the frozen `defi-safe` policy hash, minimum score `85`, and the trusted issuer baked into the Gate at deploy time.
