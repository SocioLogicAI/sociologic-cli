import { getApiBaseUrl } from "./config.js";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  status: string;
  api_key?: string;
  email?: string;
  name?: string;
  upgraded_from?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function provisionAnonymous(apiBaseUrl: string): Promise<{ api_key: string; provider: "anonymous"; expires_at: string }> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as Record<string, Record<string, string>>)?.error?.message || `Anonymous provisioning failed (${response.status})`);
  }

  const result = await response.json();
  if (!result.api_key || typeof result.api_key !== "string") {
    throw new Error("Invalid response from anonymous provisioning endpoint");
  }
  return result as { api_key: string; provider: "anonymous"; expires_at: string };
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/auth/device-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "sociologic-cli/0.1.0",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to request device code: ${response.status} ${body}`);
  }

  return (await response.json()) as DeviceCodeResponse;
}

export async function pollDeviceToken(
  deviceCode: string,
  interval: number,
  expiresIn: number,
  existingApiKey?: string,
): Promise<DeviceTokenResponse> {
  const baseUrl = getApiBaseUrl();
  const deadline = Date.now() + expiresIn * 1000;
  let pollInterval = interval;

  while (Date.now() < deadline) {
    await sleep(pollInterval * 1000);

    const bodyPayload: Record<string, string> = { device_code: deviceCode };
    if (existingApiKey) {
      bodyPayload.existing_api_key = existingApiKey;
    }

    const response = await fetch(`${baseUrl}/api/v1/auth/device-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "sociologic-cli/0.1.0",
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Device token request failed: ${response.status} ${body}`);
    }

    const result = (await response.json()) as DeviceTokenResponse;

    if (result.status === "complete" && result.api_key) {
      return result;
    }

    if (result.status === "authorization_pending") {
      continue;
    }

    if (result.status === "slow_down") {
      pollInterval += 5;
      continue;
    }

    throw new Error(`Unexpected device token status: ${result.status}`);
  }

  throw new Error("Device authorization timed out. Please try again.");
}
