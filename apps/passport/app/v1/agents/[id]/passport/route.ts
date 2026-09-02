import {
  loadPublicPassport,
  parseVerifyQuery,
  publicError,
  publicJson,
  publicOptions,
  serializePassport,
} from '@/lib/api/public';

export const dynamic = 'force-dynamic';

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
    return publicJson({ passport: serializePassport(passport) }, 200, 'public');
  } catch (error) {
    return publicError(error);
  }
}
