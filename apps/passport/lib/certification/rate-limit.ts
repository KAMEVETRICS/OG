import { CertificationRequestError } from './errors.ts';
import { ensureCertificationSchema } from './database.ts';
import { sqlFirst } from './sql.ts';

const memoryHits = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded && forwarded.length > 0 && forwarded.length <= 64) return forwarded;
  const real = request.headers.get('x-real-ip')?.trim();
  if (real && real.length > 0 && real.length <= 64) return real;
  return 'unknown';
}

export function enforceMemoryQuota(
  request: Request,
  route: string,
  limit: number,
  windowMs = 60_000,
): void {
  const key = `${route}:${clientIp(request)}`;
  const now = Date.now();
  const current = memoryHits.get(key);
  if (!current || current.resetAt <= now) {
    memoryHits.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    throw new CertificationRequestError(
      'Too many requests. Try again shortly.',
      429,
      'rate_limit',
    );
  }
  current.count += 1;
}

export async function enforceRouteQuota(
  request: Request,
  route: string,
  limit: number,
  windowMs = 60_000,
): Promise<void> {
  await ensureCertificationSchema();
  const windowKey = `m:${Math.floor(Date.now() / windowMs)}`;
  const key = `rl:${route}:${clientIp(request)}`;
  try {
    const row = await sqlFirst<{ bump_quota: string }>(
      'SELECT bump_quota($1, $2, $3)',
      [windowKey, key, limit],
    );
    if (!row?.bump_quota) {
      throw new CertificationRequestError(
        'Too many requests. Try again shortly.',
        429,
        'rate_limit',
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('rate_limit')) {
      throw new CertificationRequestError(
        'Too many requests. Try again shortly.',
        429,
        'rate_limit',
      );
    }
    throw error;
  }
}
