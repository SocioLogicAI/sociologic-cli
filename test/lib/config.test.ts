import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { readConfig, writeConfig, clearConfig, getApiKey, getApiBaseUrl } from "../../src/lib/config.js";

describe("config", () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sociologic-test-"));
    process.env.SOCIOLOGIC_CONFIG_DIR = tmpDir;
    delete process.env.SOCIOLOGIC_KEY;
    delete process.env.SOCIOLOGIC_API_URL;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore original env
    process.env.SOCIOLOGIC_KEY = originalEnv.SOCIOLOGIC_KEY;
    process.env.SOCIOLOGIC_API_URL = originalEnv.SOCIOLOGIC_API_URL;
    process.env.SOCIOLOGIC_CONFIG_DIR = originalEnv.SOCIOLOGIC_CONFIG_DIR;
  });

  it("returns empty config when no file exists", () => {
    const config = readConfig();
    expect(config).toEqual({});
  });

  it("writes and reads config correctly", () => {
    writeConfig({ api_key: "test-key-123", email: "test@example.com" });

    const config = readConfig();
    expect(config.api_key).toBe("test-key-123");
    expect(config.email).toBe("test@example.com");
  });

  it("merges updates into existing config", () => {
    writeConfig({ api_key: "key-1", email: "a@b.com" });
    writeConfig({ name: "Test User" });

    const config = readConfig();
    expect(config.api_key).toBe("key-1");
    expect(config.email).toBe("a@b.com");
    expect(config.name).toBe("Test User");
  });

  it("getApiKey returns key from config", () => {
    writeConfig({ api_key: "config-key" });
    expect(getApiKey()).toBe("config-key");
  });

  it("getApiKey prefers SOCIOLOGIC_KEY env var over config", () => {
    writeConfig({ api_key: "config-key" });
    process.env.SOCIOLOGIC_KEY = "env-key";
    expect(getApiKey()).toBe("env-key");
  });

  it("getApiKey returns undefined when no key is set", () => {
    expect(getApiKey()).toBeUndefined();
  });

  it("getApiBaseUrl returns default when nothing is configured", () => {
    expect(getApiBaseUrl()).toBe("https://www.sociologic.ai");
  });

  it("getApiBaseUrl uses config value over default", () => {
    writeConfig({ api_base_url: "https://custom.example.com" });
    expect(getApiBaseUrl()).toBe("https://custom.example.com");
  });

  it("getApiBaseUrl uses config value over env var", () => {
    process.env.SOCIOLOGIC_API_URL = "https://env.example.com";
    writeConfig({ api_base_url: "https://config.example.com" });
    expect(getApiBaseUrl()).toBe("https://config.example.com");
  });

  it("clearConfig removes the file", () => {
    writeConfig({ api_key: "to-be-deleted" });
    const configPath = path.join(tmpDir, "config.json");
    expect(fs.existsSync(configPath)).toBe(true);

    clearConfig();
    expect(fs.existsSync(configPath)).toBe(false);

    // Reading after clear should return empty
    const config = readConfig();
    expect(config).toEqual({});
  });

  it("clearConfig does not throw when file does not exist", () => {
    expect(() => clearConfig()).not.toThrow();
  });
});
