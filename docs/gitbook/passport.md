# Passport

Part of the [public API](api-overview.md). Same decision as [Inspect](inspect.md).

```http
GET /v1/agents/{agentId}/passport?implementationHash=0x…
```

Returns the full AgentSeal decision for one ERC-8004 identity and one implementation hash.

## Path and query

| Name | In | Rules |
| --- | --- | --- |
| `agentId` | path | Decimal integer, no leading zeros, fits `uint256` |
| `implementationHash` | query | `0x` + 64 hex characters. Mixed case is accepted and lowercased |
| `versionHash` | query | Alias of `implementationHash` |

Duplicate query keys, control characters, and oversized values are rejected with `400`.

## Response `200`

```json
{
  "passport": {
    "agentId": "3522746",
    "implementationHash": "0x1d82…da08",
    "safeToIntegrate": true,
    "gateAdmitted": true,
    "identity": {
      "agentId": "3522746",
      "owner": "0xaD55…",
      "tokenUri": "data:application/json;base64,…",
      "metadata": { "name": "Atlas-0G", "active": true }
    },
    "validation": {
      "status": "valid",
      "sealId": "1",
      "seal": {
        "safetyScore": 100,
        "evidenceRoot": "0xfa51…",
        "expiresAt": "2026-09-09T01:03:00.000Z",
        "revoked": false
      }
    },
    "policy": {
      "id": "defi-safe",
      "version": "1.0.0",
      "hash": "0x5635eef2ec2ab753999901846dc52029f59a751d04d818f19acf1dd33c077ddb",
      "minimumScore": 85
    },
    "checkedAt": "2026-09-02T00:00:00.000Z"
  }
}
```

`safeToIntegrate` is `identity != null && status === "valid" && gateAdmitted`.

`validation.status` is one of: `valid`, `missing`, `revoked`, `expired`, `wrong-issuer`, `critical-failure`, `score-too-low`.

Well-formed requests that fail the trust checks still return **200** with `safeToIntegrate: false`. Integrators should branch on that field, not on HTTP 404.
