import { parseAgentId, parseOwnerAddress, singleQuery } from "@/lib/api/input";
import { getOwnedAgent } from "@/lib/certification/agents";
import { certificationErrorResponse } from "@/lib/certification/http";
import { enforceRouteQuota } from "@/lib/certification/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await enforceRouteQuota(request, "agent", 30);
    const { id } = await context.params;
    parseAgentId(id);
    const url = new URL(request.url);
    const agent = await getOwnedAgent(
      id,
      parseOwnerAddress(singleQuery(url.searchParams, "owner")),
    );
    return Response.json({ agent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
