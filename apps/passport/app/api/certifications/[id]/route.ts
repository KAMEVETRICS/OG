import { certificationErrorResponse } from '@/lib/certification/http';
import { refreshedPublicState } from '@/lib/certification/public-state';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    return Response.json({ certification: await refreshedPublicState(id) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
