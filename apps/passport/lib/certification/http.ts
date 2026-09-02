import { InputError, rejectDangerousKeys } from '@/lib/api/input';
import { CertificationRequestError, CertificationStorageError } from './errors';

export async function readJsonObject(request: Request, maximumBytes = 16_384): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declaredLength) || declaredLength > maximumBytes) {
    throw new CertificationRequestError('Request body is too large.', 413, 'payload_too_large');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maximumBytes) {
    throw new CertificationRequestError('Request body is too large.', 413, 'payload_too_large');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CertificationRequestError('Request body must be valid JSON.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CertificationRequestError('Request body must be a JSON object.');
  }
  rejectDangerousKeys(value);
  return value as Record<string, unknown>;
}

export function certificationErrorResponse(error: unknown): Response {
  if (error instanceof InputError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof CertificationRequestError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof CertificationStorageError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error('[certification] Internal request failure:', error instanceof Error ? error.message : error);
  return Response.json(
    { error: 'Certification could not continue. Retry in a moment.', code: 'internal_error' },
    { status: 500 },
  );
}
