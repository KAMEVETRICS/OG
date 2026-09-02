# Self-service certification

The Passport `/certify` route turns an owned ERC-8004 identity and exact implementation into an AgentSeal assessment request. The UI discovers the connected wallet's agents. A current on-chain seal is enough to inspect; a new assessment still needs the system prompt (or a stored/registered package) because the implementation hash cannot reconstruct the prompt.

## Assessment package

On first use, paste the agent’s system prompt in `/certify`. The server builds the assessment package, derives the implementation hash, commits the package to 0G Storage after ownership authorization, and records a versioned public package route. Later certification requests resolve that package automatically. If a valid AgentSeal already exists for the agent, Certify shows the live seal and an Inspect link instead of asking for a prompt.

Owners may still upload a JSON document no larger than 64 KB. AgentSeal validates it the same way.

Advanced integrations may publish the same JSON at a stable HTTPS URL and advertise it in ERC-8004 registration metadata with the exact service name `AgentSeal Assessment`, `AgentSeal Package`, or `AgentSeal Manifest`. Redirects and private-network targets are rejected in production.

```json
{
  "schemaVersion": "1.0",
  "manifest": {
    "schemaVersion": "1.0",
    "agentName": "Example Agent",
    "release": "1.0.0",
    "source": {
      "repository": "https://example.com/agent",
      "commit": "<immutable source revision>",
      "artifactDigest": "0x<32-byte canonical artifact digest>"
    },
    "runtime": {
      "systemPromptHash": "0x<sha256 of the exact UTF-8 system prompt>",
      "model": "0g-compute-router",
      "modelRevision": "<configured 0G model revision>",
      "toolSchemaHash": "0x<canonical tool-schema hash>",
      "configHash": "0x<canonical Router request-config hash>",
      "runtimeDigest": "0x<32-byte runtime digest>"
    }
  },
  "systemPrompt": "The exact system prompt under assessment.",
  "toolSchema": ["swap", "approve", "transfer", "read"]
}
```

The server independently verifies the system-prompt hash, tool-schema hash, Router config hash, configured model revision, and `implementationFingerprint(manifest)` before it creates a challenge. Browser-supplied implementation hashes and package URLs are ignored by the certification API.

## Authorization and lifecycle

0G ChainScan is used only to discover candidate token IDs. The server verifies every candidate and every submitted ID against the official ERC-8004 Identity Registry, then asks the current owner wallet to sign a ten-minute, origin-bound, request-bound challenge. The signed message does not authorize an asset transfer or Identity Registry change.

A successful signature returns a browser-session resume token. The UI advances one policy case at a time and can resume after a network interruption. Public request state never includes the challenge, signature, resume-token hash, package prompt, compute credential, or issuer private key.

Request states are:

```text
awaiting_signature → queued → assessing → assessed → uploading → issuing → sealed
                                      └──────────────────────────────→ rejected
                         transient operational failure ─────────────→ failed
```

Every policy case runs three times. A seal is eligible only when all required evidence is present, the minimum score is met, and no critical case fails. The finalizer uploads the canonical report to 0G Storage, issues a seven-day version-bound seal, and verifies that AgentGate admits the exact `(agentId, implementationHash)` pair.

## Production configuration

Configure these as server-side Sites runtime values:

- `OG_RPC_URL`
- `OG_STORAGE_INDEXER_RPC`
- `OG_COMPUTE_BASE_URL`
- `OG_COMPUTE_API_KEY`
- `OG_COMPUTE_MODEL`
- `OG_PRIVATE_KEY`
- `ERC8004_IDENTITY_REGISTRY`
- `SITE_ORIGIN`
- `CERTIFIER_DAILY_OWNER_LIMIT` and `CERTIFIER_DAILY_GLOBAL_LIMIT` when overriding defaults

`OG_PRIVATE_KEY` is the authorized AgentSeal issuer and pays 0G Storage and chain costs. It must never use a `VITE_` or `NEXT_PUBLIC_` prefix. D1 binding `DB` stores resumable request state, versioned package registrations, and an issuer lease that prevents concurrent finalization from racing the signer nonce.

## Safety boundaries

- Certification evaluates the validated package selected for the signed request, not arbitrary code discoverable from an agent ID.
- An AgentSeal is policy-specific, implementation-specific, issuer-specific, and time-limited; it is not a universal guarantee.
- Failed TEE verification, incomplete evidence, storage-root mismatch, contract failure, or AgentGate rejection fails closed.
- Daily limits are abuse controls, not billing or Sybil resistance. A production operator should monitor cost, latency, failed requests, and issuer balance.
