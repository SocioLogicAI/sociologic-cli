import { getApiKey, getApiBaseUrl } from "./config.js";

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public details?: Record<string, unknown>;

  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiRequest<T>(
  path: string,
  options?: { method?: string; body?: unknown; requireAuth?: boolean },
): Promise<T> {
  const { method = "GET", body, requireAuth = true } = options ?? {};

  const apiKey = getApiKey();
  if (requireAuth && !apiKey) {
    throw new ApiError(401, "Not authenticated. Run `sociologic login` first.");
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "sociologic-cli/0.1.0",
  };

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const fetchOptions: RequestInit = { method, headers };
  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    let errorMessage = response.statusText;
    let errorCode: string | undefined;
    let errorDetails: Record<string, unknown> | undefined;
    try {
      const errorBody = (await response.json()) as Record<string, unknown>;
      // API returns { error: { code, message, ...extra } } or { error: "string" } or { message: "string" }
      if (errorBody.error && typeof errorBody.error === "object") {
        const nested = errorBody.error as Record<string, unknown>;
        errorMessage = (nested.message as string) ?? errorMessage;
        errorCode = nested.code as string | undefined;
        // Preserve all extra fields (e.g. cost_estimate_usd, balance_usd)
        const { code: _c, message: _m, ...rest } = nested;
        if (Object.keys(rest).length > 0) {
          errorDetails = rest;
        }
      } else {
        errorMessage = (errorBody.message as string) ?? (errorBody.error as string) ?? errorMessage;
        errorCode = errorBody.code as string | undefined;
      }
    } catch {
      // Could not parse error body — use statusText
    }
    throw new ApiError(response.status, errorMessage, errorCode, errorDetails);
  }

  return (await response.json()) as T;
}
