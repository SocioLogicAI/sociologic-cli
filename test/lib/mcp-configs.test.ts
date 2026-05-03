import { describe, it, expect } from "vitest";
import {
  getClient,
  getSociologicServerEntry,
  mergeServerEntry,
  SIGNAL_RELAY_URL,
} from "../../src/lib/mcp-configs.js";

describe("mcp-configs", () => {
  describe("getSociologicServerEntry", () => {
    it("returns env var reference when no key provided", () => {
      const entry = getSociologicServerEntry();
      expect(entry.url).toBe(SIGNAL_RELAY_URL);
      expect(entry.env).toEqual({ SOCIOLOGIC_KEY: "${SOCIOLOGIC_KEY}" });
      expect(entry.headers).toBeUndefined();
    });

    it("embeds API key in headers when provided", () => {
      const entry = getSociologicServerEntry("pl_live_test123");
      expect(entry.url).toBe(SIGNAL_RELAY_URL);
      expect(entry.headers).toEqual({ "X-API-Key": "pl_live_test123" });
      expect(entry.env).toBeUndefined();
    });
  });

  describe("getClient", () => {
    it("returns claude-code client", () => {
      const client = getClient("claude-code");
      expect(client.name).toBe("Claude Code");
      expect(client.serverKey).toBe("mcpServers");
    });

    it("returns claude-desktop client", () => {
      const client = getClient("claude-desktop");
      expect(client.name).toBe("Claude Desktop");
      expect(client.serverKey).toBe("mcpServers");
    });

    it("returns cursor client", () => {
      const client = getClient("cursor");
      expect(client.name).toBe("Cursor");
      expect(client.serverKey).toBe("mcpServers");
    });

    it("throws for unknown client", () => {
      expect(() => getClient("unknown-editor")).toThrow(
        'Unknown client "unknown-editor". Supported clients: claude-code, claude-desktop, cursor',
      );
    });
  });

  describe("mergeServerEntry", () => {
    it("adds sociologic to empty config", () => {
      const client = getClient("claude-code");
      const result = mergeServerEntry({}, client);
      expect(result).toEqual({
        mcpServers: {
          sociologic: getSociologicServerEntry(),
        },
      });
    });

    it("preserves existing servers when merging", () => {
      const client = getClient("claude-code");
      const existing = {
        mcpServers: {
          "other-server": { url: "https://other.example.com" },
        },
      };
      const result = mergeServerEntry(existing, client);
      expect(result).toEqual({
        mcpServers: {
          "other-server": { url: "https://other.example.com" },
          sociologic: getSociologicServerEntry(),
        },
      });
    });

    it("overwrites existing sociologic entry", () => {
      const client = getClient("claude-code");
      const existing = {
        mcpServers: {
          sociologic: { url: "https://old.example.com" },
          "other-server": { url: "https://other.example.com" },
        },
      };
      const result = mergeServerEntry(existing, client);
      expect(result).toEqual({
        mcpServers: {
          "other-server": { url: "https://other.example.com" },
          sociologic: getSociologicServerEntry(),
        },
      });
    });

    it("preserves non-server keys in config", () => {
      const client = getClient("claude-code");
      const existing = {
        someOtherSetting: true,
        mcpServers: {
          "other-server": { url: "https://other.example.com" },
        },
      };
      const result = mergeServerEntry(existing, client);
      expect(result).toEqual({
        someOtherSetting: true,
        mcpServers: {
          "other-server": { url: "https://other.example.com" },
          sociologic: getSociologicServerEntry(),
        },
      });
    });
  });
});
