import { apiRequest, ApiError } from "../lib/api.js";
import { success, error, dim, table } from "../lib/output.js";

interface EndpointResult {
  path: string;
  method: string;
  status_code: number | null;
  response_time_ms: number | null;
  passed: boolean;
  error?: string;
}

interface SmokeTestResults {
  passed: boolean;
  tested_at: string;
  endpoints: EndpointResult[];
  summary: { total: number; passed: number; failed: number };
  error?: string;
}

interface RegisterResponsePassed {
  status: "passed";
  submission_id: string;
  listing: {
    slug: string;
    name: string;
    tier: string;
    category: string;
    base_url: string | null;
  };
  smoke_test_results: SmokeTestResults;
}

interface RegisterResponseFailed {
  status: "failed";
  submission_id: string;
  smoke_test_results: SmokeTestResults;
  message: string;
}

type RegisterResponse = RegisterResponsePassed | RegisterResponseFailed;

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

    const smokeResults = result.smoke_test_results;
    const { summary } = smokeResults;

    const endpointRows = smokeResults.endpoints.map((ep) => [
      ep.method.toUpperCase(),
      ep.path,
      ep.status_code != null ? String(ep.status_code) : "-",
      ep.response_time_ms != null ? `${ep.response_time_ms}ms` : "n/a",
      ep.passed ? success("pass") : error(ep.error || "fail"),
    ]);

    if (result.status === "passed") {
      console.log(success("Agent registered as unverified"));
      console.log(`  Slug: ${result.listing.slug}`);
      console.log(`  Endpoints tested: ${summary.passed}/${summary.total} passed`);
      if (endpointRows.length > 0) {
        console.log();
        console.log(table(endpointRows));
      }
    } else {
      console.error(error("Smoke tests failed"));
      if (smokeResults.error) {
        console.log(`  ${smokeResults.error}`);
      }
      console.log(`  Endpoints tested: ${summary.passed}/${summary.total} passed`);
      if (result.message && !smokeResults.error) {
        console.log(`  ${result.message}`);
      }
      if (endpointRows.length > 0) {
        console.log();
        console.log(table(endpointRows));
      }
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
