import type { RegistrationMetadata } from '@agentseal/sdk';

const ASSESSMENT_SERVICE_NAMES = new Set([
  'agentseal assessment',
  'agentseal package',
  'agentseal manifest',
]);

function normalizedServiceName(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
}

export function isAgentSealAssessmentService(value: unknown): boolean {
  return ASSESSMENT_SERVICE_NAMES.has(normalizedServiceName(value));
}

export function findRegisteredAssessmentEndpoint(
  metadata: RegistrationMetadata | null,
): string | null {
  const service = metadata?.services?.find(
    (candidate) =>
      isAgentSealAssessmentService(candidate.name) &&
      typeof candidate.endpoint === 'string' &&
      candidate.endpoint.trim().length > 0,
  );
  return service?.endpoint?.trim() ?? null;
}

export function parseChainScanAgentIds(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const result = (raw as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null) return [];
  const list = (result as { list?: unknown }).list;
  if (!Array.isArray(list)) return [];
  return [
    ...new Set(
      list.flatMap((item) => {
        if (typeof item !== 'object' || item === null) return [];
        const tokenId = (item as { tokenId?: unknown }).tokenId;
        const value = typeof tokenId === 'number' ? String(tokenId) : tokenId;
        return typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
          ? [value]
          : [];
      }),
    ),
  ];
}
