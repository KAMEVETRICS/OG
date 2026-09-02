import { parseOwnerAddress, singleQuery } from "@/lib/api/input";
import { listOwnedAgents } from "@/lib/certification/agents";
import { certificationErrorResponse } from "@/lib/certification/http";
import { enforceRouteQuota } from "@/lib/certification/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await enforceRouteQuota(request, "agents", 20);
    const url = new URL(request.url);
    const owner = parseOwnerAddress(singleQuery(url.searchParams, "owner"));
    const agents = await listOwnedAgents(owner);
    return Response.json({ agents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
