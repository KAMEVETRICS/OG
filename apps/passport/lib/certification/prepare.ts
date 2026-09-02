import { parseAgentId } from '../api/input.ts';
import {
  createAssessmentPackageFromPrompt,
  validateUploadedAssessmentPackage,
} from './assessment.ts';
import { getVerifiedIdentity, resolveStoredPackage } from './agents.ts';
import { certificationModelRevision } from './env.ts';
import { CertificationRequestError } from './errors.ts';
import type { AssessmentPackage } from './types.ts';

export interface PreparedCertification {
  agentId: string;
  ownerAddress: string;
  implementationHash: string;
  packageUrl: string;
  assessmentPackage: AssessmentPackage;
}

function managedPackageUrl(
  origin: string,
  agentId: string,
  implementationHash: string,
): string {
  return `${origin}/api/agents/${agentId}/assessment-packages/${implementationHash}`;
}

export async function prepareCertificationPackage(
  body: Record<string, unknown>,
  origin: string,
): Promise<PreparedCertification> {
  const agentId = parseAgentId(body.agentId).toString();
  const identity = await getVerifiedIdentity(agentId);
  const ownerAddress = identity.owner.toLowerCase();
  const agentName =
    typeof identity.metadata?.name === 'string' && identity.metadata.name.trim()
      ? identity.metadata.name.trim().slice(0, 120)
      : `Agent #${agentId}`;

  let implementationHash: string;
  let assessmentPackage: AssessmentPackage;

  if (typeof body.systemPrompt === 'string') {
    try {
      const uploaded = createAssessmentPackageFromPrompt({
        systemPrompt: body.systemPrompt,
        agentName,
        modelRevision: certificationModelRevision(),
        repository: `${origin}/api/agents/${agentId}`,
      });
      implementationHash = uploaded.implementationHash;
      assessmentPackage = uploaded.assessmentPackage;
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
  } else {
    const stored = await resolveStoredPackage(agentId, ownerAddress);
    if (!stored) {
      throw new CertificationRequestError(
        'Paste this agent’s system prompt, or upload its assessment package, to continue.',
        422,
        'package_not_configured',
      );
    }
    implementationHash = stored.implementationHash;
    assessmentPackage = stored.assessmentPackage;
  }

  return {
    agentId,
    ownerAddress,
    implementationHash,
    packageUrl: managedPackageUrl(origin, agentId, implementationHash),
    assessmentPackage,
  };
}
