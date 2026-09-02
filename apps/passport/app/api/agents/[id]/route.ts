import { parseAgentId, parseOwnerAddress, singleQuery } from "@/lib/api/input";
import { getOwnedAgent } from "@/lib/certification/agents";
import { certificationErrorResponse } from "@/lib/certification/http";
import { certifyOrigin } from "@/lib/site-origin";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    parseAgentId(id);
    const url = new URL(request.url);
    const agent = await getOwnedAgent(
      id,
      parseOwnerAddress(singleQuery(url.searchParams, "owner")),
      certifyOrigin(),
    );
    return Response.json({ agent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
