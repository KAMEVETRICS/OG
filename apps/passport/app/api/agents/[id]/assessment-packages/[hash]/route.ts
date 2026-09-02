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
    const stored = JSON.parse(row.package_json) as {
      schemaVersion?: unknown;
      manifest?: unknown;
      toolSchema?: unknown;
    };
    return Response.json(
      {
        schemaVersion: stored.schemaVersion,
        manifest: stored.manifest,
        toolSchema: stored.toolSchema,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=3600, immutable",
          ETag: `"${row.storage_digest}"`,
        },
      },
    );
  } catch (error) {
    return certificationErrorResponse(error);
  }
}
