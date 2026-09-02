import { parseOwnerAddress, singleQuery } from "@/lib/api/input";
import { listOwnedAgents } from "@/lib/certification/agents";
import { certificationErrorResponse } from "@/lib/certification/http";
import { certifyOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const owner = parseOwnerAddress(singleQuery(url.searchParams, "owner"));
    const origin = certifyOrigin();
    const agents = await listOwnedAgents(owner, origin);
    return Response.json({ agents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
