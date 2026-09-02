import {
  countGlobalCertifications,
  countRecentCertifications,
  consumeChallenge,
  getCertification,
} from '@/lib/certification/database';
import {
  certificationErrorResponse,
  readJsonObject,
} from '@/lib/certification/http';
import {
  CertificationRequestError,
  certifierLimits,
  getAgentOwner,
  randomToken,
  refreshedPublicState,
  tokenHash,
  verifyOwnerSignature,
} from '@/lib/certification/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(request);
    const requestId =
      typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
      throw new CertificationRequestError(
        'Certification request ID is invalid.',
      );
    const row = await getCertification(requestId);
    if (!row)
      throw new CertificationRequestError(
        'Certification request was not found.',
        404,
        'not_found',
      );
    if (
      row.status !== 'awaiting_signature' ||
      row.challenge_expires_at <= Date.now()
    ) {
      throw new CertificationRequestError(
        'This ownership challenge has expired. Start a new request.',
        409,
        'challenge_expired',
      );
    }
    const currentOwner = await getAgentOwner(row.agent_id);
    if (currentOwner.toLowerCase() !== row.owner_address.toLowerCase()) {
      throw new CertificationRequestError(
        'ERC-8004 ownership changed after the challenge was created.',
        409,
        'ownership_changed',
      );
    }
    verifyOwnerSignature(row.challenge_message, body.signature, currentOwner);
    const since = Date.now() - 24 * 60 * 60 * 1_000;
    const limits = certifierLimits();
    const [ownerCount, globalCount] = await Promise.all([
      countRecentCertifications(currentOwner, since),
      countGlobalCertifications(since),
    ]);
    if (ownerCount >= limits.owner) {
      throw new CertificationRequestError(
        'This owner has reached the daily certification limit.',
        429,
        'owner_rate_limit',
      );
    }
    if (globalCount >= limits.global) {
      throw new CertificationRequestError(
        'Daily certification capacity is full. Try again tomorrow.',
        429,
        'global_rate_limit',
      );
    }
    const resumeToken = randomToken();
    const consumed = await consumeChallenge(
      row.id,
      await tokenHash(resumeToken),
      Date.now(),
    );
    if (!consumed)
      throw new CertificationRequestError(
        'This ownership challenge was already used.',
        409,
        'challenge_consumed',
      );
    return Response.json(
      {
        certification: await refreshedPublicState(row.id),
        resumeToken,
      },
      { status: 201 },
    );
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
