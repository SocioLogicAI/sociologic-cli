import { apiRequest, ApiError } from "../lib/api.js";
import { success, error, dim, table } from "../lib/output.js";

interface EndpointResult {
  path: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  pass: boolean;
}

interface RegisterResponse {
  status: "passed" | "failed";
  slug?: string;
  endpoints_tested: number;
  endpoints_passed: number;
  results: EndpointResult[];
}

interface RegisterOptions {
  name: string;
  email: string;
  description?: string;
  iconUrl?: string;
  homepageUrl?: string;
}

export async function register(openapiSpecUrl: string, options: RegisterOptions): Promise<void> {
  if (!options.name) {
    console.error(error("--name is required"));
    process.exitCode = 1;
    return;
  }

  if (!options.email) {
    console.error(error("--email is required"));
    process.exitCode = 1;
    return;
  }

  try {
    const result = await apiRequest<RegisterResponse>("/api/v1/agents/register", {
      method: "POST",
      body: {
        openapi_spec_url: openapiSpecUrl,
        name: options.name,
        description: options.description ?? "No description provided",
        contact_email: options.email,
        icon_url: options.iconUrl,
        homepage_url: options.homepageUrl,
      },
    });

    const endpointRows = result.results.map((ep) => [
      ep.method.toUpperCase(),
      ep.path,
      String(ep.status_code),
      `${ep.response_time_ms}ms`,
      ep.pass ? success("pass") : error("fail"),
    ]);

    if (result.status === "passed") {
      console.log(success("Agent registered as unverified"));
      if (result.slug) {
        console.log(`  Slug: ${result.slug}`);
      }
      console.log(`  Endpoints tested: ${result.endpoints_passed}/${result.endpoints_tested} passed`);
      console.log();
      console.log(table(endpointRows));
    } else {
      console.error(error("Smoke tests failed"));
      console.log(`  Endpoints tested: ${result.endpoints_passed}/${result.endpoints_tested} passed`);
      console.log();
      console.log(table(endpointRows));
      console.log();
      console.log(dim("Fix the failing endpoints and resubmit."));
      process.exitCode = 1;
    }
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(error(err.message));
    } else {
      console.error(error(String(err)));
    }
    process.exitCode = 1;
  }
}
