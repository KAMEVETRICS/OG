# Self-service certification

The Passport `/certify` route turns an owned ERC-8004 identity and a **pasted prompt or uploaded package** into an AgentSeal assessment request. The UI discovers the connected wallet's agents. A current on-chain seal for the stored package hash is enough to inspect; a new assessment still needs the system prompt (or the stored package) because the implementation hash cannot reconstruct the prompt.

Certification evaluates that package on 0G Compute. It does not fetch the ERC-8004 agent's live endpoint, source repository, or arbitrary package URLs.

## Assessment package

On first use, paste the agent’s system prompt in `/certify`. The server builds the assessment package, derives the implementation hash, and after the owner signature commits the package to 0G Storage. Later certification requests resolve that stored version automatically. If a valid AgentSeal already exists for that stored hash, Certify shows the live seal and an Inspect link instead of asking for a prompt.

Owners may still upload a JSON document no larger than 64 KB. AgentSeal validates it the same way. Manifest `source.repository` / `commit` fields are caller-supplied labels hashed into the implementation fingerprint; the certifier does not fetch or verify git history.

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

The server independently verifies the system-prompt hash, tool-schema hash, Router config hash, configured model revision, and `implementationFingerprint(manifest)` before it returns a challenge. Browser-supplied implementation hashes and package URLs are ignored. Unsigned challenges are not stored.

## Authorization and lifecycle

0G ChainScan is used only to discover candidate token IDs. The server verifies every candidate and every submitted ID against the official ERC-8004 Identity Registry. Creating a challenge is a read: the server rebuilds the package in memory and returns an origin-bound, request-bound message. Nothing is written until the current owner signs that exact message.

`POST /certifications` reconstructs the message from the submitted package, verifies the signature against `ownerOf` now, then inserts `queued` and consumes daily quotas in one Postgres function. A successful signature returns a browser-session resume token. Each advance hop and seal issuance re-checks ERC-8004 ownership. Public request state never includes the challenge, signature, resume-token hash, package prompt, compute credential, or issuer private key.

Request states are:

```text
queued → assessing → assessed → uploading → issuing → sealed
                   └────────────────────────────────→ rejected
```

Every policy case runs three times. The model under test sees wallet constraints plus the case request; it does not receive the policy rule list or expected decisions. A seal is eligible only when all required evidence is present, the minimum score is met, and no critical case fails. The finalizer uploads the canonical report to 0G Storage, issues a seven-day version-bound seal, and verifies that AgentGate admits the exact `(agentId, implementationHash)` pair.

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

`OG_PRIVATE_KEY` is the authorized AgentSeal issuer and pays 0G Storage and chain costs. It must never use a `VITE_` or `NEXT_PUBLIC_` prefix. Neon (`DATABASE_URL`) stores resumable request state, versioned package registrations, route quotas, and an issuer lease that prevents concurrent finalization from racing the signer nonce.

## Safety boundaries

- Certification evaluates the validated package selected for the signed request, not arbitrary code discoverable from an agent ID.
- An AgentSeal is policy-specific, implementation-specific, issuer-specific, and time-limited; it is not a universal guarantee that a deployed agent still runs that prompt.
- Router `tee_verified` is a vendor-reported flag, not an independently verified attestation document.
- Failed Router TEE flag, incomplete evidence, storage-root mismatch, contract failure, ownership change, or AgentGate rejection fails closed.
- Daily limits and per-IP quotas are abuse controls, not billing or Sybil resistance. A production operator should monitor cost, latency, failed requests, and issuer balance.
