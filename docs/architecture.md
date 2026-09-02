# AgentSeal architecture

AgentSeal certifies one exact agent implementation against one exact policy for a limited period. A seal is an onchain claim backed by TEE-provenance assessment runs and immutable evidence—not a claim that the agent is safe in every context.

```mermaid
flowchart TB
    subgraph Certification[Certification pipeline]
      Agent[Agent implementation\nsource + prompt + model + tools + config]
      Fingerprint[Version fingerprint\nimplementationHash]
      Policy[Versioned safety policy\npolicyHash]
      Assessor[AgentSeal assessor\nadversarial cases + fail-closed scoring]
      Compute[0G Compute Router\nverify_tee=true]
      Report[Canonical assessment report\nassessmentHash]
      Storage[0G Storage\nevidenceRoot]

      Agent --> Fingerprint
      Fingerprint --> Assessor
      Policy --> Assessor
      Assessor --> Compute
      Compute --> Assessor
      Assessor --> Report
      Report --> Storage
    end

    subgraph Mainnet[0G mainnet · chain 16661]
      Identity[ERC-8004 Identity Registry]
      Registry[AgentSealRegistry\nversion + policy + evidence + score + expiry]
      Gate[AgentGate\npolicy + minimum score + trusted issuer]
    end

    subgraph Consumer[Consumer path]
      SDK[@agentseal/sdk]
      Passport[Agent Passport]
      Dapp[Wallet / protocol / agent platform]
    end

    Identity --> Registry
    Fingerprint --> Registry
    Policy --> Registry
    Storage --> Registry
    Registry --> Gate
    Identity --> SDK
    Registry --> SDK
    Gate --> SDK
    SDK --> Passport
    SDK --> Dapp
```

## Trust objects

| Object | What it binds | Where it lives |
| --- | --- | --- |
| ERC-8004 agent ID | Agent identity and owner | 0G mainnet |
| Implementation hash | Source, prompt, model revision, tool schema, and runtime configuration | Seal + assessment |
| Policy hash | Policy version, constraints, and adversarial cases | Seal + assessment |
| Assessment hash | Canonical evaluation result and per-run receipts | Assessment artifact |
| Evidence root | Exact canonical assessment bytes | 0G Storage + seal |
| AgentSeal | Identity, implementation, policy, evidence, score, issuer, issue time, and expiry | 0G mainnet |

## Verification decision

The SDK returns `safeToIntegrate: true` only when all three conditions hold:

1. the ERC-8004 identity exists;
2. the latest seal for the exact identity, implementation hash, and policy is valid; and
3. the configured `AgentGate` admits that exact implementation.

Missing identity, missing seal, revocation, expiry, issuer mismatch, critical failure, low score, RPC failure, or a changed implementation hash all fail closed.

## TEE boundary

0G Compute execution records set `verify_tee: true`. AgentSeal fail-closes unless the Router JSON includes `x_0g_trace.tee_verified: true`, then stores that Router-reported flag with request, provider, model, billing, and response-hash. This is not an independent attestation check. The benchmark evaluator separately determines behavioral correctness. A seal does not prove that a live agent endpoint runs the assessed prompt.

## Mainnet configuration

| Component | Address |
| --- | --- |
| ERC-8004 Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| AgentSealRegistry | `0xEEB2c6bD3249647941aEc2D96dD9067594dbc4a2` |
| AgentGate | `0x78f63314330FbEe998dDEBB89A27cD922DAcD11d` |
