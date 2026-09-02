import { parseAgentId, parseImplementationHash } from "@/lib/api/input";
import { getAgentPackageVersion } from "@/lib/certification/database";
import { CertificationRequestError } from "@/lib/certification/errors";
import { certificationErrorResponse } from "@/lib/certification/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; hash: string }> },
): Promise<Response> {
  try {
    const { id, hash } = await context.params;
    const agentId = parseAgentId(id).toString();
    const implementationHash = parseImplementationHash(hash);
    const row = await getAgentPackageVersion(agentId, implementationHash);
    if (!row)
      throw new CertificationRequestError(
        "Assessment package was not found.",
        404,
        "package_not_found",
      );
    return new Response(row.package_json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=3600, immutable",
        ETag: `"${row.storage_digest}"`,
      },
    });
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
