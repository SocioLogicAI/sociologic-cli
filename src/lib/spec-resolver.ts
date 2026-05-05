import type { ResolvedAgent } from "./agent-resolver.js";

export interface ResolvedOperation {
  url: string;           // Full URL to call
  method: string;        // HTTP method from the spec
  path: string;          // Matched path from spec
  operationId?: string;  // If matched by operationId
  isFirstParty: boolean; // true if base_url is on sociologic.ai
}

interface SpecOperation {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
}

/**
 * Compute Levenshtein edit distance between two strings.
 */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Extract the last non-parameter segment from a path.
 * E.g., "/rng/{operation}" -> "rng", "/rng/uuid" -> "uuid", "/api/v1/rng/dice" -> "dice"
 */
function lastNonParamSegment(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!segments[i].startsWith("{") && !segments[i].endsWith("}")) {
      return segments[i];
    }
  }
  return null;
}

/**
 * Count how many segments of the operation match the path.
 */
function matchingSegments(operation: string, path: string): number {
  const opParts = operation.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  let count = 0;
  for (const part of opParts) {
    if (pathParts.includes(part)) count++;
  }
  return count;
}

/**
 * Extract the base URL from an OpenAPI 3.x or Swagger 2.0 spec.
 */
function extractBaseUrl(spec: Record<string, unknown>): string | null {
  // OpenAPI 3.x: servers[0].url
  if (spec.servers && Array.isArray(spec.servers) && spec.servers.length > 0) {
    const server = spec.servers[0] as Record<string, unknown>;
    if (typeof server.url === "string") {
      return server.url.replace(/\/+$/, "");
    }
  }

  // Swagger 2.0: host + basePath
  if (typeof spec.host === "string") {
    const scheme = Array.isArray(spec.schemes) && spec.schemes.length > 0
      ? spec.schemes[0] as string
      : "https";
    const basePath = typeof spec.basePath === "string" ? spec.basePath : "";
    return `${scheme}://${spec.host}${basePath}`.replace(/\/+$/, "");
  }

  return null;
}

/**
 * Extract all operations from an OpenAPI spec.
 */
function extractOperations(spec: Record<string, unknown>): SpecOperation[] {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return [];

  const httpMethods = ["get", "post", "put", "patch", "delete", "head", "options"];
  const ops: SpecOperation[] = [];

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    for (const method of httpMethods) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation || typeof operation !== "object") continue;

      ops.push({
        method: method.toUpperCase(),
        path: pathStr,
        operationId: (operation.operationId as string) || undefined,
        summary: (operation.summary as string) || undefined,
      });
    }
  }

  return ops;
}

/**
 * Extract declared parameter names from an OpenAPI operation.
 * Reads both `parameters` (query/path) and `requestBody` schema properties.
 */
function getOperationParamNames(
  spec: Record<string, unknown>,
  path: string,
  method: string,
): string[] {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return [];

  const pathItem = paths[path];
  if (!pathItem) return [];

  const operation = pathItem[method] as Record<string, unknown> | undefined;
  if (!operation) return [];

  const names: string[] = [];

  // Query/path parameters
  const parameters = operation.parameters as Array<{ name?: string }> | undefined;
  if (Array.isArray(parameters)) {
    for (const p of parameters) {
      if (p.name) names.push(p.name);
    }
  }

  // Request body schema properties (for POST/PUT/PATCH)
  const requestBody = operation.requestBody as Record<string, unknown> | undefined;
  if (requestBody) {
    const content = requestBody.content as Record<string, Record<string, unknown>> | undefined;
    const jsonContent = content?.["application/json"];
    const schema = jsonContent?.schema as Record<string, unknown> | undefined;
    const properties = schema?.properties as Record<string, unknown> | undefined;
    if (properties) {
      names.push(...Object.keys(properties));
    }
  }

  return names;
}

/**
 * Resolve an operation string against an agent's OpenAPI spec.
 *
 * Matching order:
 * 1. Exact operationId match
 * 2. Path suffix match (if operation contains "/")
 * 3. Last non-parameter segment match
 *
 * If no match is found, throws with a "did you mean?" suggestion.
 */
export function resolveOperation(
  agent: ResolvedAgent,
  operation: string,
  params: Record<string, string>,
): ResolvedOperation {
  if (!agent.openapi_spec) {
    throw new Error(
      `Agent "${agent.slug}" has no API spec. Cannot resolve operations.\n` +
      `  Hint: use \`sociologic operations ${agent.slug}\` to check available operations.`,
    );
  }

  const spec = agent.openapi_spec;
  const ops = extractOperations(spec);

  if (ops.length === 0) {
    throw new Error(`Agent "${agent.slug}" has no operations defined in its API spec.`);
  }

  // Determine base URL: prefer agent.base_url, fall back to spec
  const specBaseUrl = extractBaseUrl(spec);
  const baseUrl = agent.base_url || specBaseUrl;

  if (!baseUrl) {
    throw new Error(
      `Agent "${agent.slug}" has no base URL configured and none found in the spec.`,
    );
  }

  let isFirstParty = false;
  try {
    const hostname = new URL(baseUrl).hostname;
    isFirstParty = hostname === "sociologic.ai" || hostname.endsWith(".sociologic.ai");
  } catch {
    // Invalid URL — treat as third-party
  }

  let matched: SpecOperation | undefined;

  // 1. Exact operationId match
  matched = ops.find((op) => op.operationId === operation);

  // 2. Path suffix match (if operation contains "/")
  if (!matched && operation.includes("/")) {
    const suffix = operation.startsWith("/") ? operation : `/${operation}`;
    const suffixMatches = ops.filter((op) => op.path.endsWith(suffix));
    if (suffixMatches.length === 1) {
      matched = suffixMatches[0];
    } else if (suffixMatches.length > 1) {
      // Pick the one with more matching segments
      matched = suffixMatches.sort(
        (a, b) => matchingSegments(operation, b.path) - matchingSegments(operation, a.path),
      )[0];
    }
  }

  // 3. Last non-parameter segment match
  if (!matched) {
    const segmentMatches = ops.filter((op) => {
      const lastSeg = lastNonParamSegment(op.path);
      return lastSeg === operation;
    });
    if (segmentMatches.length === 1) {
      matched = segmentMatches[0];
    } else if (segmentMatches.length > 1) {
      // Pick the one with more matching segments
      matched = segmentMatches.sort(
        (a, b) => matchingSegments(operation, b.path) - matchingSegments(operation, a.path),
      )[0];
    }
  }

  if (!matched) {
    // Build "did you mean?" suggestion
    const candidates = ops
      .map((op) => op.operationId || lastNonParamSegment(op.path) || op.path)
      .filter((name): name is string => !!name);

    const unique = [...new Set(candidates)];
    let suggestion = "";
    if (unique.length > 0) {
      const sorted = unique
        .map((name) => ({ name, dist: editDistance(operation.toLowerCase(), name.toLowerCase()) }))
        .sort((a, b) => a.dist - b.dist);

      if (sorted[0].dist <= 3) {
        suggestion = `\n  Did you mean "${sorted[0].name}"?`;
      }
    }

    const available = ops
      .map((op) => `  ${op.method.padEnd(6)} ${op.operationId || "—"} ${op.path}`)
      .join("\n");

    throw new Error(
      `No operation "${operation}" found for agent "${agent.slug}".${suggestion}\n\nAvailable operations:\n${available}`,
    );
  }

  // Validate user params against the spec's declared parameters
  if (Object.keys(params).length > 0) {
    const specParams = getOperationParamNames(spec, matched.path, matched.method.toLowerCase());
    if (specParams.length > 0) {
      for (const userKey of Object.keys(params)) {
        if (!specParams.includes(userKey)) {
          const suggestion = specParams
            .map((name) => ({ name, dist: editDistance(userKey.toLowerCase(), name.toLowerCase()) }))
            .sort((a, b) => a.dist - b.dist);

          const hint = suggestion.length > 0 && suggestion[0].dist <= 3
            ? ` Did you mean "${suggestion[0].name}"?`
            : "";

          throw new Error(
            `Unknown parameter "${userKey}" for operation "${matched.operationId || matched.path}".${hint}\n` +
            `  Valid parameters: ${specParams.join(", ")}`,
          );
        }
      }
    }
  }

  // Build the full URL
  const cleanBase = baseUrl.replace(/\/+$/, "");
  let fullUrl = `${cleanBase}${matched.path}`;

  // For GET requests, append params as query string
  if (matched.method === "GET" && Object.keys(params).length > 0) {
    const qs = new URLSearchParams(params).toString();
    fullUrl = `${fullUrl}?${qs}`;
  }

  return {
    url: fullUrl,
    method: matched.method,
    path: matched.path,
    operationId: matched.operationId,
    isFirstParty,
  };
}
