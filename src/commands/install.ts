import fs from "fs";
import path from "path";
import { getApiKey, getApiBaseUrl, writeConfig } from "../lib/config.js";
import { provisionAnonymous } from "../lib/auth.js";
import { getClient, getSupportedClients, mergeServerEntry } from "../lib/mcp-configs.js";
import { success, error, warn, dim } from "../lib/output.js";

export async function install(client: string, options: { global?: boolean }): Promise<void> {
  // 1. Validate client name
  let clientConfig;
  try {
    clientConfig = getClient(client);
  } catch {
    console.log(error(`Unknown client "${client}"`));
    console.log(dim(`Supported clients: ${getSupportedClients().join(", ")}`));
    process.exitCode = 1;
    return;
  }

  // 2. Check for API key — auto-provision anonymous session if missing
  let apiKey = getApiKey();
  if (!apiKey) {
    try {
      const result = await provisionAnonymous(getApiBaseUrl());
      writeConfig({ api_key: result.api_key, provider: "anonymous" });
      apiKey = result.api_key;
      console.log(success("Anonymous session created (1 free credit). Run 'npx sociologic login' to unlock full access."));
    } catch (err) {
      console.log(warn(`Auto-provisioning failed: ${err instanceof Error ? err.message : String(err)}`));
      console.log(warn("No API key found. Run 'npx sociologic login' to authenticate."));
    }
  }

  // 3. Get config path
  const configPath = clientConfig.configPath(options.global ?? false);

  // 4. Read existing config
  let existingConfig: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    existingConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  // 5. Merge server entry (embed API key directly if available)
  const merged = mergeServerEntry(existingConfig, clientConfig, apiKey);

  // 6. Create directory if needed
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 7. Write config
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");

  // 8. Print success
  console.log(success(`MCP config written to ${configPath}`));

  if (apiKey) {
    console.log(dim("API key embedded in config. Ready to use."));
  } else {
    console.log(dim("No API key found. Run `sociologic login` first, then re-run this command."));
  }
}
