import {
  loadPublicPassport,
  parseVerifyQuery,
  publicError,
  publicJson,
  publicOptions,
} from '@/lib/api/public';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

export function OPTIONS(): Response {
  return publicOptions();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const { agentId, implementationHash } = parseVerifyQuery(
      id,
      new URL(request.url).searchParams,
    );
    const passport = await loadPublicPassport(agentId, implementationHash);
    return publicJson(
      {
        agentId: agentId.toString(),
        implementationHash,
        allowed: passport.safeToIntegrate,
        gateAdmitted: passport.gateAdmitted,
        status: passport.validation.status,
        identityFound: passport.identity !== null,
      },
      200,
      'public',
    );
  } catch (error) {
    return publicError(error);
  }
}
