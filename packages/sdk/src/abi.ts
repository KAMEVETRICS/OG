export const AGENT_SEAL_REGISTRY_ABI = [
  "function validateSeal(uint256 agentId, bytes32 versionHash, bytes32 policyHash, uint16 minimumScore, address trustedIssuer) view returns (uint8 status, uint256 sealId)",
  "function isCompliant(uint256 agentId, bytes32 versionHash, bytes32 policyHash, uint16 minimumScore, address trustedIssuer) view returns (bool)",
  "function seals(uint256 sealId) view returns (uint256 agentId, bytes32 versionHash, bytes32 policyHash, bytes32 evidenceRoot, uint16 safetyScore, uint16 passedChecks, uint16 totalChecks, uint16 criticalFailures, uint64 issuedAt, uint64 expiresAt, address issuer, bool revoked)",
] as const;

export const AGENT_GATE_ABI = [
  "function canExecute(uint256 agentId, bytes32 versionHash) view returns (bool)",
  "function policyHash() view returns (bytes32)",
  "function minimumScore() view returns (uint16)",
  "function trustedIssuer() view returns (address)",
] as const;

export const ERC8004_IDENTITY_ABI = [
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
] as const;
