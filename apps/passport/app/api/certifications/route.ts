import { createSignedCertification } from '@/lib/certification/database';
import {
  certificationErrorResponse,
  readJsonObject,
} from '@/lib/certification/http';
import { getAgentOwner } from '@/lib/certification/chain';
import {
  createChallengeMessage,
  parseChallengeExpiry,
  parseChallengeNonce,
  parseRequestId,
  randomToken,
  tokenHash,
  verifyOwnerSignature,
} from '@/lib/certification/challenge';
import { certifierLimits } from '@/lib/certification/env';
import { CertificationRequestError } from '@/lib/certification/errors';
import { MAX_ASSESSMENT_PACKAGE_BYTES } from '@/lib/certification/assessment';
import { prepareCertificationPackage } from '@/lib/certification/prepare';
import { refreshedPublicState } from '@/lib/certification/public-state';
import { enforceRouteQuota } from '@/lib/certification/rate-limit';
import { certifyOrigin } from '@/lib/site-origin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    await enforceRouteQuota(request, 'certify', 10);
    const body = await readJsonObject(
      request,
      MAX_ASSESSMENT_PACKAGE_BYTES + 4_096,
    );
    const now = Date.now();
    const requestId = parseRequestId(body.requestId);
    const nonce = parseChallengeNonce(body.nonce);
    const expiresAt = parseChallengeExpiry(body.expiresAt, now);
    const origin = certifyOrigin();
    const prepared = await prepareCertificationPackage(body, origin);
    const currentOwner = await getAgentOwner(prepared.agentId);
    if (currentOwner.toLowerCase() !== prepared.ownerAddress) {
      throw new CertificationRequestError(
        'ERC-8004 ownership changed after the challenge was created.',
        409,
        'ownership_changed',
      );
    }
    const challengeMessage = createChallengeMessage({
      requestId,
      agentId: prepared.agentId,
      implementationHash: prepared.implementationHash,
      packageUrl: prepared.packageUrl,
      ownerAddress: prepared.ownerAddress,
      origin,
      expiresAt,
      nonce,
    });
    verifyOwnerSignature(challengeMessage, body.signature, currentOwner);
    const limits = certifierLimits();
    const resumeToken = randomToken();
    await createSignedCertification({
      id: requestId,
      agentId: prepared.agentId,
      implementationHash: prepared.implementationHash,
      packageUrl: prepared.packageUrl,
      packageJson: JSON.stringify(prepared.assessmentPackage),
      agentName: prepared.assessmentPackage.manifest.agentName,
      owner: currentOwner,
      challengeMessage,
      expiresAt,
      resumeTokenHash: await tokenHash(resumeToken),
      now,
      ownerLimit: limits.owner,
      globalLimit: limits.global,
    });
    return Response.json(
      {
        certification: await refreshedPublicState(requestId),
        resumeToken,
      },
      { status: 201 },
    );
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
