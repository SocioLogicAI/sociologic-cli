import fs from "fs";
import path from "path";
import os from "os";

export interface SociologicConfig {
  api_key?: string;
  email?: string;
  name?: string;
  api_base_url?: string;
  provider?: "anonymous" | "github";
}

function getConfigDir(): string {
  return process.env.SOCIOLOGIC_CONFIG_DIR ?? path.join(os.homedir(), ".sociologic");
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function readConfig(): SociologicConfig {
  const configPath = getConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as SociologicConfig;
  } catch {
    return {};
  }
}

export function writeConfig(updates: Partial<SociologicConfig>): void {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const existing = readConfig();
  const merged = { ...existing, ...updates };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}

export function clearConfig(): void {
  const configPath = getConfigPath();
  try {
    fs.unlinkSync(configPath);
  } catch {
    // File doesn't exist — nothing to clear
  }
}

export function getApiKey(): string | undefined {
  return process.env.SOCIOLOGIC_KEY ?? readConfig().api_key;
}

export function getApiBaseUrl(): string {
  return readConfig().api_base_url ?? process.env.SOCIOLOGIC_API_URL ?? "https://www.sociologic.ai";
}
