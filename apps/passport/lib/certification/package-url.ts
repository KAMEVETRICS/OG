export class UnsafePackageUrlError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function mappedIpv4(host: string): string | null {
  const match = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return match?.[1] ?? null;
}

function isBlockedIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe80:') || normalized.startsWith('ff')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  const mapped = mappedIpv4(normalized);
  return mapped ? isBlockedIpv4(mapped) : false;
}

export function isBlockedPackageHost(host: string): boolean {
  const hostname = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    return true;
  }
  if (hostname.includes(':')) return isBlockedIpv6(hostname);
  return isBlockedIpv4(hostname);
}

export function assertSafePackageUrl(value: string, allowedOrigin?: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafePackageUrlError('Assessment package URL is invalid');
  }
  if (url.protocol !== 'https:') {
    throw new UnsafePackageUrlError('Assessment package URL must use HTTPS');
  }
  if (url.username || url.password || url.hash) {
    throw new UnsafePackageUrlError(
      'Assessment package URL contains unsupported credentials or fragments',
    );
  }
  if (isBlockedPackageHost(url.hostname)) {
    throw new UnsafePackageUrlError('Assessment package URL cannot target a private network');
  }
  if (allowedOrigin && url.origin !== new URL(allowedOrigin).origin) {
    throw new UnsafePackageUrlError('Assessment package URL must be on this Passport origin');
  }
  return url;
}

export function isSameOriginUrl(value: string, origin: string): boolean {
  try {
    return new URL(value).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
