import { resolveAgent } from "../lib/agent-resolver.js";
import { bold, dim, error, tierBadge, table } from "../lib/output.js";

interface OperationInfo {
  method: string;
  operationId: string;
  path: string;
  summary: string;
}

/**
 * Extract operations from an OpenAPI 3.x or Swagger 2.0 spec.
 */
function extractOperations(spec: Record<string, unknown>): OperationInfo[] {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return [];

  const httpMethods = ["get", "post", "put", "patch", "delete", "head", "options"];
  const ops: OperationInfo[] = [];

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of httpMethods) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation || typeof operation !== "object") continue;

      ops.push({
        method: method.toUpperCase(),
        operationId: (operation.operationId as string) || "",
        path: pathStr,
        summary: (operation.summary as string) || (operation.description as string) || "",
      });
    }
  }

  return ops;
}

export async function operations(agentSlug: string): Promise<void> {
  let agent;
  try {
    agent = await resolveAgent(agentSlug);
  } catch (err) {
    console.error(error(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
    return;
  }

  if (!agent.openapi_spec) {
    console.error(error("This agent has no API spec. Operations cannot be listed."));
    process.exitCode = 1;
    return;
  }

  const ops = extractOperations(agent.openapi_spec);

  if (ops.length === 0) {
    console.error(error("No operations found in the agent's API spec."));
    process.exitCode = 1;
    return;
  }

  console.log();
  console.log(`Operations for ${bold(agent.slug)} ${dim("(")}${tierBadge(agent.tier)}${dim(")")}:`);
  console.log();

  const rows = ops.map((op) => [
    `  ${bold(op.method.padEnd(6))}`,
    op.operationId || dim("—"),
    dim(op.path),
    dim(op.summary),
  ]);

  console.log(table(rows));
  console.log();
  console.log(dim(`${ops.length} operation(s) available`));
}
