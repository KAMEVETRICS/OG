import { certificationErrorResponse } from '@/lib/certification/http';
import { refreshedPublicState } from '@/lib/certification/public-state';
import { enforceRouteQuota } from '@/lib/certification/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await enforceRouteQuota(request, 'certification-read', 60);
    const { id } = await context.params;
    return Response.json({ certification: await refreshedPublicState(id) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
