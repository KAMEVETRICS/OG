import { InputError, rejectDangerousKeys } from '@/lib/api/input';
import { CertificationRequestError, CertificationStorageError } from './errors';

async function readBodyCapped(request: Request, maximumBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new CertificationRequestError('Request body is too large.', 413, 'payload_too_large');
  }
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new CertificationRequestError('Request body is too large.', 413, 'payload_too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function readJsonObject(request: Request, maximumBytes = 16_384): Promise<Record<string, unknown>> {
  const text = await readBodyCapped(request, maximumBytes);
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
