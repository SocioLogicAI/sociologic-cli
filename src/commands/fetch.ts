import { apiRequest, ApiError } from "../lib/api.js";
import { error, dim } from "../lib/output.js";

export async function fetchCmd(url: string, options: { method?: string; body?: string }): Promise<void> {
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
