import type { CertificationPublicState } from '@/lib/certification/types';

export const ACTIVE_STATUSES = new Set([
  'queued',
  'assessing',
  'assessed',
  'uploading',
  'issuing',
]);
export const OG_CHAIN_ID = '0x4115';
export const OG_CHAIN = {
  chainId: OG_CHAIN_ID,
  chainName: '0G Mainnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: ['https://evmrpc.0g.ai'],
  blockExplorerUrls: ['https://chainscan.0g.ai'],
} as const;
export const MAX_PACKAGE_BYTES = 65_536;

export function short(value: string | null, left = 10, right = 8): string {
  if (!value) return '—';
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

export async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed with HTTP ${response.status}`);
  }
  return body;
}

export function stepState(
  certification: CertificationPublicState | null,
  index: number,
): 'pending' | 'active' | 'complete' | 'failed' {
  if (!certification) return index === 0 ? 'active' : 'pending';
  if (certification.status === 'rejected' && index === 2) {
    return 'failed';
  }
  const completed =
    certification.status === 'sealed'
      ? 4
      : ['assessed', 'uploading', 'issuing'].includes(certification.status)
        ? 3
        : 2;
  if (index < completed) return 'complete';
  if (index === completed) return 'active';
  return 'pending';
}

export function walletErrorCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const record = error as {
    code?: unknown;
    data?: { originalError?: { code?: unknown } };
  };
  if (typeof record.data?.originalError?.code === 'number') {
    return record.data.originalError.code;
  }
  return typeof record.code === 'number' ? record.code : null;
}
