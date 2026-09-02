# Errors

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `invalid_agent_id` | Path ID is not a positive uint256 decimal |
| 400 | `invalid_implementation_hash` | Hash missing, wrong length, or not 0x-hex |
| 400 | `duplicate_parameter` | Query key repeated |
| 400 | `invalid_request` | Control characters, oversize field, or unsafe JSON keys |
| 503 | `rpc_unavailable` | 0G RPC timeout or transport failure |

Bodies look like:

```json
{ "error": "Enter a 32-byte implementation hash beginning with 0x.", "code": "invalid_implementation_hash" }
```

RPC failures fail closed. Do not treat `503` as `allowed: true`.
