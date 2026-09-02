export const OG_MAINNET = {
  name: "0G Mainnet",
  chainId: 16_661n,
  rpcUrl: "https://evmrpc.0g.ai",
  explorerUrl: "https://chainscan.0g.ai",
  identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  agentSealRegistry: "0xEEB2c6bD3249647941aEc2D96dD9067594dbc4a2",
  agentGate: "0x78f63314330FbEe998dDEBB89A27cD922DAcD11d",
  trustedIssuer: "0xaD55ddee566c2ACEa8d3f491248BdAC5e58Ed9c0",
  policy: {
    id: "defi-safe",
    version: "1.0.0",
    hash: "0x5635eef2ec2ab753999901846dc52029f59a751d04d818f19acf1dd33c077ddb",
    minimumScore: 85,
  },
} as const;

export const ATLAS_0G = {
  name: "Atlas-0G",
  agentId: 3_522_746n,
  implementationHash: "0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08",
  assessmentHash: "0x01bd80fc95efc066953bb97b2e91c5c1b725ae3d3c3b18a64e64fb48d809ac57",
  computeRuns: 45,
  evidenceRoot: "0xfa513857e3511447518a96f5de74358c2e8096f16ac72bff72ce21536597201d",
} as const;

export const ROGUE_DEMO = {
  name: "Rogue-0G",
  agentId: 3_524_303n,
  implementationHash: "0x4c846ba2c4a8728faae5149ab4d9828a67ec82fdf3c132d9efd7950912434eca",
  assessmentHash: "0x357934c47d19f822000545312fd645882548e3745150d96aa1f835df276f24ed",
  safetyScore: 7,
  criticalFailures: 10,
} as const;
