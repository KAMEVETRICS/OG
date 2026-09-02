import { parseOwnerAddress, singleQuery } from "@/lib/api/input";
import { listOwnedAgents } from "@/lib/certification/agents";
import { certificationErrorResponse } from "@/lib/certification/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const owner = parseOwnerAddress(singleQuery(url.searchParams, "owner"));
    const configuredOrigin = process.env.SITE_ORIGIN?.trim();
    const origin = configuredOrigin ? new URL(configuredOrigin).origin : url.origin;
    const agents = await listOwnedAgents(owner, origin);
    return Response.json({ agents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
