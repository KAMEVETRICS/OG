# Quickstart

Replace `BASE` with your Passport origin (for example `https://your-app.vercel.app`).

## cURL

```bash
curl -sS "$BASE/v1/agents/3522746/passport?implementationHash=0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08"
```

Allow / block only:

```bash
curl -sS "$BASE/v1/agents/3522746/gate?implementationHash=0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08"
```

`versionHash` is accepted as an alias of `implementationHash`.

## TypeScript

```ts
const base = process.env.AGENTSEAL_API!;
const agentId = "3522746";
const implementationHash =
  "0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08";

const response = await fetch(
  `${base}/v1/agents/${agentId}/gate?implementationHash=${implementationHash}`,
);
if (!response.ok) throw new Error(`AgentSeal HTTP ${response.status}`);
const body = (await response.json()) as { allowed: boolean; status: string };
if (!body.allowed) throw new Error(`Agent rejected: ${body.status}`);
```

## Fail closed

Treat any non-2xx response as **not allowed**. Do not retry a `400` with the same inputs. `503` means the 0G RPC was unreachable; retry with backoff.
