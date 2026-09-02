import { parseAgentId } from '@/lib/api/input';
import {
  deleteExpiredChallenges,
  insertCertification,
} from '@/lib/certification/database';
import {
  getVerifiedIdentity,
  resolveAgentPackage,
} from '@/lib/certification/agents';
import {
  createAssessmentPackageFromPrompt,
  MAX_ASSESSMENT_PACKAGE_BYTES,
  validateUploadedAssessmentPackage,
} from '@/lib/certification/assessment';
import {
  certificationErrorResponse,
  readJsonObject,
} from '@/lib/certification/http';
import { createChallengeMessage, randomToken } from '@/lib/certification/challenge';
import { certificationModelRevision } from '@/lib/certification/env';
import { CertificationRequestError } from '@/lib/certification/errors';
import type {
  AssessmentPackage,
  CertificationRow,
} from '@/lib/certification/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonObject(
      request,
      MAX_ASSESSMENT_PACKAGE_BYTES + 4_096,
    );
    const agentId = parseAgentId(body.agentId).toString();
    const configuredOrigin = process.env.SITE_ORIGIN?.trim();
    const origin = configuredOrigin
      ? new URL(configuredOrigin).origin
      : new URL(request.url).origin;
    const identity = await getVerifiedIdentity(agentId);
    const ownerAddress = identity.owner;
    const resolved = await resolveAgentPackage(identity, origin);
    let implementationHash: string;
    let packageUrl: string;
    let assessmentPackage: AssessmentPackage;
    if (resolved && body.systemPrompt === undefined && body.assessmentPackage === undefined) {
      ({ implementationHash, packageUrl, assessmentPackage } = resolved);
    } else if (typeof body.systemPrompt === 'string') {
      try {
        const uploaded = createAssessmentPackageFromPrompt({
          systemPrompt: body.systemPrompt,
          agentName:
            typeof identity.metadata?.name === 'string' &&
            identity.metadata.name.trim()
              ? identity.metadata.name.trim().slice(0, 120)
              : `Agent #${agentId}`,
          modelRevision: certificationModelRevision(),
          repository: `${origin}/api/agents/${agentId}`,
        });
        implementationHash = uploaded.implementationHash;
        assessmentPackage = uploaded.assessmentPackage;
        packageUrl = `${origin}/api/agents/${agentId}/assessment-packages/${implementationHash}`;
      } catch (error) {
        throw new CertificationRequestError(
          error instanceof Error
            ? error.message
            : 'The system prompt could not be turned into an assessment package.',
          422,
          'invalid_package',
        );
      }
    } else if (body.assessmentPackage !== undefined) {
      const uploaded = validateUploadedAssessmentPackage(
        body.assessmentPackage,
        certificationModelRevision(),
      );
      implementationHash = uploaded.implementationHash;
      assessmentPackage = uploaded.assessmentPackage;
      packageUrl = `${origin}/api/agents/${agentId}/assessment-packages/${implementationHash}`;
    } else {
      throw new CertificationRequestError(
        'Paste this agent’s system prompt, or upload its assessment package, to continue.',
        422,
        'package_not_configured',
      );
    }

    const now = Date.now();
    await deleteExpiredChallenges(now);

    const id = crypto.randomUUID();
    const expiresAt = now + 10 * 60 * 1_000;
    const challengeMessage = createChallengeMessage({
      requestId: id,
      agentId,
      implementationHash,
      packageUrl,
      ownerAddress,
      origin,
      expiresAt,
      nonce: randomToken(16),
    });
    const row: CertificationRow = {
      id,
      agent_id: agentId,
      implementation_hash: implementationHash,
      package_url: packageUrl,
      package_json: JSON.stringify(assessmentPackage),
      agent_name: assessmentPackage.manifest.agentName,
      owner_address: ownerAddress.toLowerCase(),
      challenge_message: challengeMessage,
      challenge_expires_at: expiresAt,
      resume_token_hash: null,
      status: 'awaiting_signature',
      current_case: 0,
      results_json: '[]',
      report_json: null,
      safety_score: null,
      passed_checks: null,
      total_checks: null,
      critical_failures: null,
      evidence_root: null,
      evidence_transaction: null,
      evidence_digest: null,
      seal_id: null,
      seal_transaction: null,
      seal_expires_at: null,
      gate_admitted: null,
      processing_token: null,
      processing_until: null,
      last_error: null,
      created_at: now,
      updated_at: now,
    };
    await insertCertification(row);
    return Response.json(
      {
        requestId: id,
        ownerAddress,
        agentName: assessmentPackage.manifest.agentName,
        challengeMessage,
        expiresAt: new Date(expiresAt).toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
