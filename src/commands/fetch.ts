import { apiRequest, ApiError } from "../lib/api.js";
import { resolveAgent } from "../lib/agent-resolver.js";
import { resolveOperation } from "../lib/spec-resolver.js";
import { error, warn, dim, bold } from "../lib/output.js";

export interface FetchOptions {
  dryRun?: boolean;
  raw?: boolean;
  body?: string;
  method?: string;
}

/**
 * Parse "key=value" pairs into a record.
 */
function parseParams(params: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const param of params) {
    const eqIndex = param.indexOf("=");
    if (eqIndex === -1) {
      throw new Error(`Invalid parameter "${param}". Expected format: key=value`);
    }
    const key = param.slice(0, eqIndex);
    const value = param.slice(eqIndex + 1);
    result[key] = value;
  }
  return result;
}

/**
 * Legacy fetch behavior: call the proxy endpoint with a raw URL.
 * Used when the first arg starts with http:// or https://.
 */
async function legacyFetch(
  url: string,
  options: FetchOptions,
): Promise<void> {
  console.error(warn("Passing a raw URL to `fetch` is deprecated."));
  console.error(dim("  Use: sociologic fetch <agent> <operation> [params...]"));
  console.error(dim("  Example: sociologic fetch rng uuid"));
  console.error();

  let parsedBody: unknown;
  if (options.body !== undefined) {
    try {
      parsedBody = JSON.parse(options.body);
    } catch {
      console.error(error("Invalid JSON body: could not parse the provided string"));
      process.exitCode = 1;
      return;
    }
  }

  try {
    const result = await apiRequest<unknown>("/api/v1/agents/fetch", {
      method: "POST",
      body: { url, method: options.method ?? "GET", body: parsedBody },
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      console.error(error("URL not registered as an agent"));
      console.error(dim("  Hint: use `sociologic search` to find registered agents"));
    } else if (err instanceof ApiError) {
      console.error(error(err.message));
    } else {
      console.error(error(String(err)));
    }
    process.exitCode = 1;
  }
}

/**
 * Display the response, handling meta information and formatting.
 */
function displayResponse(data: unknown, raw: boolean): void {
  if (raw) {
    console.log(JSON.stringify(data));
    return;
  }

  console.log(JSON.stringify(data, null, 2));

  // Show meta information if present
  if (data && typeof data === "object" && "meta" in data) {
    const meta = (data as Record<string, unknown>).meta as Record<string, unknown> | undefined;
    if (meta) {
      console.error();
      if (typeof meta.cost_usd === "number") {
        console.error(dim(`  Cost: $${meta.cost_usd.toFixed(2)}`));
      }
      if (typeof meta.balance_remaining === "number") {
        console.error(dim(`  Balance remaining: $${meta.balance_remaining.toFixed(2)}`));
      }
    }
  }
}

/**
 * Spec-aware fetch command.
 *
 * Usage:
 *   sociologic fetch <agent> <operation> [key=value...]
 *   sociologic fetch rng uuid
 *   sociologic fetch rng dice sides=20
 *   sociologic fetch rng shuffle --body '{"items":["a","b","c"]}'
 */
export async function fetchCmd(
  agentSlug: string,
  operation: string | undefined,
  params: string[],
  options: FetchOptions,
): Promise<void> {
  // Backward compat: if first arg looks like a URL, use legacy behavior
  if (agentSlug.startsWith("http://") || agentSlug.startsWith("https://")) {
    await legacyFetch(agentSlug, options);
    return;
  }

  // Operation is required for spec-aware mode
  if (!operation) {
    console.error(error("Missing operation argument."));
    console.error(dim("  Usage: sociologic fetch <agent> <operation> [params...]"));
    console.error(dim("  Example: sociologic fetch rng uuid"));
    console.error(dim("  Run `sociologic operations <agent>` to list available operations."));
    process.exitCode = 1;
    return;
  }

  // Parse key=value params
  let parsedParams: Record<string, string>;
  try {
    parsedParams = parseParams(params);
  } catch (err) {
    console.error(error(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
    return;
  }

  // Resolve agent
  let agent;
  try {
    agent = await resolveAgent(agentSlug);
  } catch (err) {
    console.error(error(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
    return;
  }

  // Resolve operation from spec
  let resolved;
  try {
    resolved = resolveOperation(agent, operation, parsedParams);
  } catch (err) {
    console.error(error(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
    return;
  }

  // Apply method override if provided
  const method = options.method?.toUpperCase() || resolved.method;

  // Build request body
  let requestBody: unknown;
  if (options.body !== undefined) {
    // Explicit --body flag takes precedence
    try {
      requestBody = JSON.parse(options.body);
    } catch {
      console.error(error("Invalid JSON body: could not parse the provided string"));
      process.exitCode = 1;
      return;
    }
  } else if (method === "POST" || method === "PUT" || method === "PATCH") {
    // For body-carrying methods, send params as JSON body
    if (Object.keys(parsedParams).length > 0) {
      requestBody = parsedParams;
    }
  }

  // Dry run: show what would be sent
  if (options.dryRun) {
    console.log();
    console.log(`${bold("Agent:")}    ${agent.slug}`);
    console.log(`${bold("Route:")}    ${resolved.isFirstParty ? "direct (first-party)" : "proxy (third-party)"}`);
    console.log(`${bold("Method:")}   ${method}`);
    console.log(`${bold("URL:")}      ${resolved.url}`);
    console.log(`${bold("Path:")}     ${resolved.path}`);
    if (resolved.operationId) {
      console.log(`${bold("Op ID:")}    ${resolved.operationId}`);
    }
    if (requestBody !== undefined) {
      console.log(`${bold("Body:")}     ${JSON.stringify(requestBody)}`);
    }
    console.log();
    return;
  }

  // Execute the call
  try {
    let result: unknown;

    if (resolved.isFirstParty) {
      // First-party: call the API directly (authenticated with X-API-Key)
      // resolved.url is a full URL like https://www.sociologic.ai/api/v1/rng/uuid?...
      // We need to extract the path portion for apiRequest
      const fullUrl = new URL(resolved.url);
      const pathWithQuery = fullUrl.pathname + fullUrl.search;

      result = await apiRequest<unknown>(pathWithQuery, {
        method,
        body: requestBody,
      });
    } else {
      // Third-party: go through the fetch proxy
      result = await apiRequest<unknown>("/api/v1/agents/fetch", {
        method: "POST",
        body: {
          url: resolved.url,
          method,
          body: requestBody,
        },
      });
    }

    displayResponse(result, !!options.raw);
  } catch (err) {
    if (err instanceof ApiError && err.status === 402) {
      console.error(error("This agent requires payment (x402). Payment support coming soon."));
      if (err.message && err.message !== "Payment Required") {
        console.error(dim(`  ${err.message}`));
      }
    } else if (err instanceof ApiError && err.status === 403) {
      console.error(error("URL not registered as an agent"));
      console.error(dim("  Hint: use `sociologic search` to find registered agents"));
    } else if (err instanceof ApiError) {
      console.error(error(err.message));
    } else {
      console.error(error(String(err)));
    }
    process.exitCode = 1;
  }
}
