import fs from "fs";
import { apiRequest, ApiError } from "../lib/api.js";
import { readConfig, getApiKey } from "../lib/config.js";
import { success, error, warn, dim } from "../lib/output.js";
import { getClient, getSupportedClients } from "../lib/mcp-configs.js";

interface BalanceResponse {
  balance_usd: number;
  currency: string;
}

export async function doctor(): Promise<void> {
  let issues = 0;

  // 1. Config file — check for API key
  const config = readConfig();
  if (config.api_key) {
    console.log(success("Config file: API key found"));
  } else {
    console.log(error("Config file: no API key configured"));
    issues++;
  }

  // 2. SOCIOLOGIC_KEY env var
  if (process.env.SOCIOLOGIC_KEY) {
    console.log(success("SOCIOLOGIC_KEY env var is set"));
  } else {
    console.log(warn("SOCIOLOGIC_KEY env var is not set (MCP servers need it)"));
    issues++;
  }

  // 3. API key validity
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(error("API key validity: no API key available"));
    issues++;
  } else {
    try {
      await apiRequest<BalanceResponse>("/api/v1/billing/balance");
      console.log(success("API key validity: key is valid"));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      console.log(error(`API key validity: ${msg}`));
      issues++;
    }
  }

  // 4. MCP configs
  const clientNames = getSupportedClients();
  for (const name of clientNames) {
    const client = getClient(name);
    const configPath = client.configPath(true);
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const servers = parsed[client.serverKey] as Record<string, unknown> | undefined;
      if (servers && "sociologic" in servers) {
        console.log(success(`${client.name}: sociologic server configured`));
      } else {
        console.log(dim(`  ${client.name}: config exists but no sociologic server entry`));
      }
    } catch {
      console.log(dim(`  ${client.name}: config not found at ${configPath}`));
    }
  }

  // 5. Summary
  console.log("");
  if (issues === 0) {
    console.log(success("All checks passed"));
  } else {
    console.log(warn(`${issues} issue(s) found`));
  }
}
