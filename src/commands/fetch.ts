import { apiRequest, ApiError } from "../lib/api.js";
import { resolveAgent } from "../lib/agent-resolver.js";
import { resolveOperation } from "../lib/spec-resolver.js";
import { error, warn, dim, bold, success } from "../lib/output.js";
import { confirm } from "../lib/prompt.js";

export interface FetchOptions {
  dryRun?: boolean;
  raw?: boolean;
  body?: string;
  method?: string;
  pay?: boolean;
  maxCost?: number;
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
 * Display the response data on stdout, and cost/meta info on stderr.
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
 * Display a paid-call success summary on stderr, then data on stdout.
 */
function displayPaidResponse(
  agentSlug: string,
  operationId: string | undefined,
  result: unknown,
  raw: boolean,
): void {
  // Extract meta from the proxy response
  const meta = (result && typeof result === "object" && "meta" in result)
    ? (result as Record<string, unknown>).meta as Record<string, unknown> | undefined
    : undefined;

  // Extract the actual data payload
  const data = (result && typeof result === "object" && "data" in result)
    ? (result as Record<string, unknown>).data
    : result;

  // Print cost summary on stderr
  if (meta) {
    const costParts: string[] = [];
    if (typeof meta.cost_usd === "number") {
      costParts.push(`Cost: $${meta.cost_usd.toFixed(2)}`);
    }
    if (typeof meta.balance_remaining === "number") {
      costParts.push(`Balance: $${meta.balance_remaining.toFixed(2)}`);
    }
    const label = operationId ? `${agentSlug} — ${operationId}` : agentSlug;
    console.error(success(label));
    if (costParts.length > 0) {
      console.error(dim(`  ${costParts.join(" | ")}`));
    }
  }

  // Print data on stdout
  if (raw) {
    console.log(JSON.stringify(data));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Handle a 402 ApiError for third-party proxy calls.
 * Returns true if the call was retried and succeeded (caller should not set exitCode).
 */
async function handlePaymentRequired(
  err: ApiError,
  agentSlug: string,
  operationId: string | undefined,
  proxyBody: Record<string, unknown>,
  options: FetchOptions,
): Promise<boolean> {
  const details = err.details;
  const costEstimate = details?.cost_estimate_usd as number | undefined;
  const balanceUsd = details?.balance_usd as number | undefined;

  // Check for specific error codes
  if (err.code === "INSUFFICIENT_BALANCE" || err.code === "INSUFFICIENT_FUNDS") {
    const bal = typeof balanceUsd === "number" ? `$${balanceUsd.toFixed(2)}` : "insufficient";
    console.error(error(`Insufficient balance (${bal}). Add funds at https://www.sociologic.ai/pricing`));
    return false;
  }

  if (err.code === "BUDGET_EXCEEDED") {
    const cost = typeof costEstimate === "number" ? `$${costEstimate.toFixed(2)}` : "unknown";
    const limit = typeof options.maxCost === "number" ? `$${options.maxCost.toFixed(2)}` : "unset";
    console.error(error(`Cost (${cost}) exceeds your limit (${limit}). Use --max-cost to adjust.`));
    return false;
  }

  // No cost estimate available — can't prompt
  if (typeof costEstimate !== "number") {
    console.error(error("This agent requires payment. Use --pay to enable."));
    return false;
  }

  // Build the prompt
  const costStr = `$${costEstimate.toFixed(2)}`;
  const balStr = typeof balanceUsd === "number" ? ` Your balance: $${balanceUsd.toFixed(2)}` : "";
  const proceed = await confirm(`This call costs ~${costStr}.${balStr}\nProceed? (y/n) `);

  if (!proceed) {
    // User declined — exit cleanly (no error exit code)
    return true;
  }

  // Retry with pay: true
  try {
    const retryBody: Record<string, unknown> = {
      ...proxyBody,
      pay: true,
      service_slug: agentSlug,
    };
    if (typeof options.maxCost === "number") {
      retryBody.max_cost = options.maxCost;
    }

    const result = await apiRequest<unknown>("/api/v1/agents/fetch", {
      method: "POST",
      body: retryBody,
    });

    displayPaidResponse(agentSlug, operationId, result, !!options.raw);
    return true;
  } catch (retryErr) {
    if (retryErr instanceof ApiError) {
      console.error(error(retryErr.message));
    } else {
      console.error(error(String(retryErr)));
    }
    return false;
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
    if (options.pay) {
      console.log(`${bold("Pay:")}      enabled`);
    }
    if (typeof options.maxCost === "number") {
      console.log(`${bold("Max cost:")} $${options.maxCost.toFixed(2)}`);
    }
    console.log();
    return;
  }

  // Execute the call
  try {
    let result: unknown;

    if (resolved.isFirstParty) {
      // First-party: call the API directly (authenticated with X-API-Key)
      const fullUrl = new URL(resolved.url);
      const pathWithQuery = fullUrl.pathname + fullUrl.search;

      result = await apiRequest<unknown>(pathWithQuery, {
        method,
        body: requestBody,
      });

      displayResponse(result, !!options.raw);
    } else {
      // Third-party: go through the fetch proxy
      const proxyBody: Record<string, unknown> = {
        url: resolved.url,
        method,
        body: requestBody,
      };

      if (options.pay) {
        // --pay flag: include payment fields upfront
        proxyBody.pay = true;
        proxyBody.service_slug = agent.slug;
        if (typeof options.maxCost === "number") {
          proxyBody.max_cost = options.maxCost;
        }
      }

      result = await apiRequest<unknown>("/api/v1/agents/fetch", {
        method: "POST",
        body: proxyBody,
      });

      if (options.pay) {
        displayPaidResponse(agent.slug, resolved.operationId, result, !!options.raw);
      } else {
        displayResponse(result, !!options.raw);
      }
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 402 && !resolved.isFirstParty) {
      // Payment required for third-party agent
      const proxyBody: Record<string, unknown> = {
        url: resolved.url,
        method,
        body: requestBody,
      };

      if (options.pay) {
        // --pay was set but still got 402 — check for specific error codes
        if (err.code === "INSUFFICIENT_BALANCE" || err.code === "INSUFFICIENT_FUNDS") {
          const bal = err.details?.balance_usd;
          const balStr = typeof bal === "number" ? `$${bal.toFixed(2)}` : "insufficient";
          console.error(error(`Insufficient balance (${balStr}). Add funds at https://www.sociologic.ai/pricing`));
        } else if (err.code === "BUDGET_EXCEEDED") {
          const cost = err.details?.cost_estimate_usd;
          const costStr = typeof cost === "number" ? `$${cost.toFixed(2)}` : "unknown";
          const limitStr = typeof options.maxCost === "number" ? `$${options.maxCost.toFixed(2)}` : "unset";
          console.error(error(`Cost (${costStr}) exceeds your limit (${limitStr}). Use --max-cost to adjust.`));
        } else {
          console.error(error("Payment failed."));
          if (err.message && err.message !== "Payment Required") {
            console.error(dim(`  ${err.message}`));
          }
        }
        process.exitCode = 1;
      } else {
        // No --pay flag: interactive prompt flow
        const handled = await handlePaymentRequired(
          err,
          agent.slug,
          resolved.operationId,
          proxyBody,
          options,
        );
        if (!handled) {
          process.exitCode = 1;
        }
      }
    } else if (err instanceof ApiError && err.status === 503) {
      console.error(error("Payment service temporarily unavailable."));
      process.exitCode = 1;
    } else if (err instanceof ApiError && err.status === 403) {
      console.error(error("URL not registered as an agent"));
      console.error(dim("  Hint: use `sociologic search` to find registered agents"));
      process.exitCode = 1;
    } else if (err instanceof ApiError) {
      console.error(error(err.message));
      process.exitCode = 1;
    } else {
      console.error(error(String(err)));
      process.exitCode = 1;
    }
  }
}
