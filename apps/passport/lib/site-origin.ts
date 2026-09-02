export function siteOrigin(): string {
  const configured = process.env.SITE_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/^https?:\/\//, '')}`;
  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment.replace(/^https?:\/\//, '')}`;
  return 'http://localhost:3000';
}
