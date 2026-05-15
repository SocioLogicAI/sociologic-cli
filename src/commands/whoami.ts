import { apiRequest } from "../lib/api.js";
import { readConfig, getApiKey } from "../lib/config.js";
import { bold, dim, error } from "../lib/output.js";

interface BalanceResponse {
  balance_usd: number;
  currency: string;
}

export async function whoami(): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(error("Not authenticated. Run `sociologic login` first."));
    process.exitCode = 1;
    return;
  }

  const config = readConfig();
  const keyPrefix = apiKey.slice(0, 12) + "...";

  let balanceStr: string;
  try {
    const result = await apiRequest<BalanceResponse>("/api/v1/billing/balance");
    balanceStr = `$${result.balance_usd.toFixed(2)}`;
  } catch {
    balanceStr = dim("(could not fetch)");
  }

  const provider = config.provider || "unknown";

  console.log(bold("Email:   ") + (config.email ?? dim("(not set)")));
  console.log(bold("Provider:") + " " + (provider === "anonymous" ? dim("anonymous (limited access)") : provider));
  console.log(bold("Key:     ") + keyPrefix);
  console.log(bold("Balance: ") + balanceStr);
}
