import os from "os";
import path from "path";

export interface ClientConfig {
  name: string;
  configPath: (global: boolean) => string;
  serverKey: string;
}

export const SIGNAL_RELAY_URL = "https://mcp.sociologic.ai/sse";

const clients: Record<string, ClientConfig> = {
  "claude-code": {
    name: "Claude Code",
    configPath: (global: boolean) =>
      global
        ? path.join(os.homedir(), ".claude", "mcp.json")
        : path.join(".claude", "mcp.json"),
    serverKey: "mcpServers",
  },
  "claude-desktop": {
    name: "Claude Desktop",
    configPath: () => {
      switch (process.platform) {
        case "darwin":
          return path.join(
            os.homedir(),
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json",
          );
        case "win32":
          return path.join(
            process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
            "Claude",
            "claude_desktop_config.json",
          );
        default:
          return path.join(
            os.homedir(),
            ".config",
            "claude",
            "claude_desktop_config.json",
          );
      }
    },
    serverKey: "mcpServers",
  },
  cursor: {
    name: "Cursor",
    configPath: () => path.join(".cursor", "mcp.json"),
    serverKey: "mcpServers",
  },
};

export function getClient(name: string): ClientConfig {
  const client = clients[name];
  if (!client) {
    const supported = Object.keys(clients).join(", ");
    throw new Error(`Unknown client "${name}". Supported clients: ${supported}`);
  }
  return client;
}

export function getSupportedClients(): string[] {
  return Object.keys(clients);
}

export function getSociologicServerEntry(): {
  url: string;
  env: { SOCIOLOGIC_KEY: string };
} {
  return {
    url: SIGNAL_RELAY_URL,
    env: { SOCIOLOGIC_KEY: "${SOCIOLOGIC_KEY}" },
  };
}

export function mergeServerEntry(
  existingConfig: Record<string, unknown>,
  client: ClientConfig,
): Record<string, unknown> {
  const serverKey = client.serverKey;
  const existing = (existingConfig[serverKey] ?? {}) as Record<string, unknown>;
  return {
    ...existingConfig,
    [serverKey]: {
      ...existing,
      sociologic: getSociologicServerEntry(),
    },
  };
}
