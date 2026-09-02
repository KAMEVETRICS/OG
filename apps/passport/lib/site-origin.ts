import { CertificationRequestError } from '@/lib/certification/errors';

export function siteOrigin(): string {
  const configured = process.env.SITE_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/^https?:\/\//, '')}`;
  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment.replace(/^https?:\/\//, '')}`;
  return 'http://localhost:3000';
}

export function certifyOrigin(): string {
  const origin = siteOrigin();
  const hosted = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
  if (hosted && !origin.startsWith('https://')) {
    throw new CertificationRequestError(
      'SITE_ORIGIN must be a public https origin in production.',
      503,
      'service_unavailable',
    );
  }
  return origin;
}
