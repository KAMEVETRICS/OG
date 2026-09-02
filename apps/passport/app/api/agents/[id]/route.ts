import { parseAgentId, parseOwnerAddress, singleQuery } from "@/lib/api/input";
import { getOwnedAgent } from "@/lib/certification/agents";
import { certificationErrorResponse } from "@/lib/certification/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    parseAgentId(id);
    const url = new URL(request.url);
    const configuredOrigin = process.env.SITE_ORIGIN?.trim();
    const origin = configuredOrigin ? new URL(configuredOrigin).origin : url.origin;
    const agent = await getOwnedAgent(
      id,
      parseOwnerAddress(singleQuery(url.searchParams, "owner")),
      origin,
    );
    return Response.json({ agent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
