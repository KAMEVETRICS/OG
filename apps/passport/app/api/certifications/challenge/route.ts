import { certifyOrigin } from '@/lib/site-origin';
import {
  MAX_ASSESSMENT_PACKAGE_BYTES,
} from '@/lib/certification/assessment';
import {
  certificationErrorResponse,
  readJsonObject,
} from '@/lib/certification/http';
import {
  CHALLENGE_TTL_MS,
  createChallengeMessage,
  randomToken,
} from '@/lib/certification/challenge';
import { prepareCertificationPackage } from '@/lib/certification/prepare';
import { enforceRouteQuota } from '@/lib/certification/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    await enforceRouteQuota(request, 'challenge', 10);
    const body = await readJsonObject(
      request,
      MAX_ASSESSMENT_PACKAGE_BYTES + 4_096,
    );
    const origin = certifyOrigin();
    const prepared = await prepareCertificationPackage(body, origin);
    const requestId = crypto.randomUUID();
    const nonce = randomToken(16);
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
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
    return Response.json(
      {
        requestId,
        nonce,
        ownerAddress: prepared.ownerAddress,
        agentName: prepared.assessmentPackage.manifest.agentName,
        implementationHash: prepared.implementationHash,
        challengeMessage,
        expiresAt: new Date(expiresAt).toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
