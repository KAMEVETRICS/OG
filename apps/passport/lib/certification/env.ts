import { OgStorageEvidenceStore } from '@agentseal/og-storage';
import { OG_MAINNET } from '@agentseal/sdk';
import { JsonRpcProvider } from 'ethers';

import { CertificationRequestError } from './errors';

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new CertificationRequestError(
      'The certification service is not fully configured.',
      503,
      'service_unavailable',
    );
  }
  return value;
}

export function issuerPrivateKey(): string {
  const configured = requiredEnv('OG_PRIVATE_KEY');
  const normalized = configured.startsWith('0x') ? configured : `0x${configured}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new CertificationRequestError(
      'The certification signer is misconfigured.',
      503,
      'service_unavailable',
    );
  }
  return normalized;
}

export function certificationModelRevision(): string {
  return process.env.OG_COMPUTE_MODEL?.trim() || 'zai-org/GLM-5-FP8';
}

export function certificationStorage(): OgStorageEvidenceStore {
  return new OgStorageEvidenceStore({
    rpcUrl: requiredEnv('OG_RPC_URL'),
    indexerUrl: requiredEnv('OG_STORAGE_INDEXER_RPC'),
    privateKey: issuerPrivateKey(),
  });
}

export function certifierLimits() {
  const owner = Number(process.env.CERTIFIER_DAILY_OWNER_LIMIT ?? '2');
  const global = Number(process.env.CERTIFIER_DAILY_GLOBAL_LIMIT ?? '20');
  return {
    owner: Number.isInteger(owner) && owner > 0 ? owner : 2,
    global: Number.isInteger(global) && global > 0 ? global : 20,
  };
}

export function certifierProvider(): JsonRpcProvider {
  return new JsonRpcProvider(process.env.OG_RPC_URL?.trim() || OG_MAINNET.rpcUrl);
}
