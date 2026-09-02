import {
  claimCertification,
  getCertification,
  isTerminalStatus,
  releaseCertification,
  setCertificationError,
} from '@/lib/certification/database';
import { certificationErrorResponse } from '@/lib/certification/http';
import { advanceCertification } from '@/lib/certification/advance';
import { tokenHash } from '@/lib/certification/challenge';
import { CertificationRequestError } from '@/lib/certification/errors';
import { refreshedPublicState } from '@/lib/certification/public-state';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let holder: string | null = null;
  let id = '';
  try {
    ({ id } = await context.params);
    const row = await getCertification(id);
    if (!row) throw new CertificationRequestError('Certification request was not found.', 404, 'not_found');
    const authorization = request.headers.get('authorization') ?? '';
    const resumeToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!resumeToken || !row.resume_token_hash || await tokenHash(resumeToken) !== row.resume_token_hash) {
      throw new CertificationRequestError('Reconnect the owner wallet to continue this assessment.', 401, 'invalid_resume_token');
    }
    if (isTerminalStatus(row.status)) return Response.json({ certification: await refreshedPublicState(id) });
    holder = crypto.randomUUID();
    const claimed = await claimCertification(id, holder, Date.now());
    if (!claimed) {
      return Response.json({ certification: await refreshedPublicState(id), busy: true }, { status: 202 });
    }
    const claimedRow = await getCertification(id);
    if (!claimedRow) throw new CertificationRequestError('Certification request was not found.', 404, 'not_found');
    await advanceCertification(claimedRow, holder);
    await releaseCertification(id, holder);
    holder = null;
    return Response.json({ certification: await refreshedPublicState(id) });
  } catch (error) {
    if (holder && id) {
      const safeMessage = error instanceof CertificationRequestError
        ? error.message
        : 'A network dependency interrupted certification. Retry to continue.';
      try {
        await setCertificationError(id, holder, safeMessage, Date.now());
        await releaseCertification(id, holder);
      } catch {
        // Preserve the original error response if the lease was already lost.
      }
    }
    return certificationErrorResponse(error);
  }
}
