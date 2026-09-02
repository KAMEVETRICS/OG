import { consumeSignedChallenge, getCertification } from '@/lib/certification/database';
import {
  certificationErrorResponse,
  readJsonObject,
} from '@/lib/certification/http';
import { getAgentOwner } from '@/lib/certification/chain';
import { randomToken, tokenHash, verifyOwnerSignature } from '@/lib/certification/challenge';
import { certifierLimits } from '@/lib/certification/env';
import { CertificationRequestError } from '@/lib/certification/errors';
import { refreshedPublicState } from '@/lib/certification/public-state';

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
    const limits = certifierLimits();
    const resumeToken = randomToken();
    await consumeSignedChallenge({
      id: row.id,
      resumeTokenHash: await tokenHash(resumeToken),
      now: Date.now(),
      owner: currentOwner,
      ownerLimit: limits.owner,
      globalLimit: limits.global,
    });
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
