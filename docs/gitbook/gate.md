# Gate

Part of the [public API](api-overview.md).

```http
GET /v1/agents/{agentId}/gate?implementationHash=0x…
```

Minimal allow/block helper. Same input rules as [Passport](passport.md).

## Response `200`

```json
{
  "agentId": "3522746",
  "implementationHash": "0x1d82…da08",
  "allowed": true,
  "gateAdmitted": true,
  "status": "valid",
  "identityFound": true
}
```

Use `allowed` as the integration switch. It is the same boolean as `passport.safeToIntegrate` (identity + valid seal + AgentGate).

`gateAdmitted` is the raw `AgentGate.canExecute` result and can be true in isolation only if you ignore identity. Prefer `allowed`.
