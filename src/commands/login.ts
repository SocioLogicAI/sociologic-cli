import { requestDeviceCode, pollDeviceToken } from "../lib/auth.js";
import { readConfig, writeConfig } from "../lib/config.js";
import * as output from "../lib/output.js";

export async function login(options: { email?: boolean }): Promise<void> {
  if (options.email) {
    console.log(output.warn("Email login not yet supported. Use GitHub login."));
    return;
  }

  try {
    const { device_code, user_code, verification_uri, expires_in, interval } =
      await requestDeviceCode();

    console.log();
    console.log(output.bold("Open this URL in your browser:"));
    console.log();
    console.log(`  ${verification_uri}`);
    console.log();
    console.log(`Enter code: ${output.bold(user_code)}`);
    console.log();

    // Try to open the URL in the default browser
    try {
      const open = (await import("open")).default;
      await open(verification_uri);
    } catch {
      // Silently ignore if we can't open the browser
    }

    console.log(output.dim("Waiting for authorization..."));

    const config = readConfig();
    const existingApiKey = config.provider === "anonymous" ? config.api_key : undefined;
    const result = await pollDeviceToken(device_code, interval, expires_in, existingApiKey);

    writeConfig({
      api_key: result.api_key,
      email: result.email,
      name: result.name,
      provider: "github",
    });

    console.log();
    if (result.upgraded_from === "anonymous") {
      console.log(output.success("Account upgraded from anonymous. Your personas and credits have been preserved."));
    } else {
      console.log(output.success(`Logged in as ${result.email}`));
    }
    console.log(output.dim(`API key stored in ~/.sociologic/config.json`));
    console.log(output.dim(`Run \`sociologic install claude-code\` to set up MCP`));
  } catch (err) {
    console.error(output.error(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
