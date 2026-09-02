export class InputError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code = 'invalid_request', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const UINT256_MAX = (1n << 256n) - 1n;
const AGENT_ID_PATTERN = /^[1-9][0-9]{0,77}$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function parseAgentId(value: unknown): bigint {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    throw new InputError('Enter a positive ERC-8004 agent ID.', 'invalid_agent_id');
  }
  const text = String(value).trim();
  if (text.length === 0 || text.length > 78 || !AGENT_ID_PATTERN.test(text)) {
    throw new InputError(
      'Enter a positive ERC-8004 agent ID that fits in uint256.',
      'invalid_agent_id',
    );
  }
  const agentId = BigInt(text);
  if (agentId > UINT256_MAX) {
    throw new InputError(
      'Enter a positive ERC-8004 agent ID that fits in uint256.',
      'invalid_agent_id',
    );
  }
  return agentId;
}

export function parseImplementationHash(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InputError(
      'Enter a 32-byte implementation hash beginning with 0x.',
      'invalid_implementation_hash',
    );
  }
  const hash = value.trim();
  if (hash.length !== 66 || !HASH_PATTERN.test(hash)) {
    throw new InputError(
      'Enter a 32-byte implementation hash beginning with 0x.',
      'invalid_implementation_hash',
    );
  }
  return hash.toLowerCase();
}

export function parseOwnerAddress(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InputError('Connect a valid EVM owner wallet.', 'invalid_owner');
  }
  const address = value.trim();
  if (address.length !== 42 || !ADDRESS_PATTERN.test(address)) {
    throw new InputError('Connect a valid EVM owner wallet.', 'invalid_owner');
  }
  return address.toLowerCase();
}

export function singleQuery(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(name);
  if (values.length > 1) {
    throw new InputError(`Query parameter ${name} must be supplied once.`, 'duplicate_parameter');
  }
  const value = values[0];
  if (value === undefined) return null;
  if (value.length > 256) {
    throw new InputError(`Query parameter ${name} is too long.`, 'invalid_request');
  }
  if (/[\0\r\n]/.test(value)) {
    throw new InputError('Request parameters must not contain control characters.', 'invalid_request');
  }
  return value;
}

export function rejectDangerousKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) rejectDangerousKeys(entry);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const key of Object.getOwnPropertyNames(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new InputError('Request JSON contains unsupported keys.', 'invalid_request');
    }
    rejectDangerousKeys((value as Record<string, unknown>)[key]);
  }
}

export function sanitizeMetadata(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (metadata === null) return null;
  const name = typeof metadata.name === 'string' ? metadata.name.trim().slice(0, 120) : undefined;
  const description =
    typeof metadata.description === 'string'
      ? metadata.description.trim().slice(0, 500)
      : undefined;
  const active = typeof metadata.active === 'boolean' ? metadata.active : undefined;
  const supportedTrust = Array.isArray(metadata.supportedTrust)
    ? metadata.supportedTrust
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().slice(0, 64))
        .slice(0, 8)
    : undefined;
  const services = Array.isArray(metadata.services)
    ? metadata.services
        .filter((entry): entry is Record<string, unknown> =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
        )
        .slice(0, 16)
        .map((service) => ({
          name: typeof service.name === 'string' ? service.name.trim().slice(0, 80) : undefined,
          version:
            typeof service.version === 'string' ? service.version.trim().slice(0, 32) : undefined,
          endpoint: sanitizePublicUrl(service.endpoint),
        }))
    : undefined;
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(active !== undefined ? { active } : {}),
    ...(supportedTrust && supportedTrust.length > 0 ? { supportedTrust } : {}),
    ...(services && services.length > 0 ? { services } : {}),
  };
}

function sanitizePublicUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, 500);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function truncate(value: string | null, maximum = 2_048): string | null {
  if (value === null) return null;
  return value.length <= maximum ? value : `${value.slice(0, maximum)}…`;
}
