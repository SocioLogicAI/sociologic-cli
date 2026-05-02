import { apiRequest, ApiError } from "../lib/api.js";
import { bold, error } from "../lib/output.js";

interface BalanceResponse {
  balance_usd: number;
  currency: string;
}

export async function balance(): Promise<void> {
  try {
    const result = await apiRequest<BalanceResponse>("/api/v1/billing/balance");
    console.log(bold(`Balance: $${result.balance_usd.toFixed(2)}`));
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(error(err.message));
    } else {
      console.error(error(String(err)));
    }
    process.exitCode = 1;
  }
}
