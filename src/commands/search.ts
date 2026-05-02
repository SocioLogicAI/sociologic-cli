import { apiRequest } from "../lib/api.js";
import { dim, tierBadge, table } from "../lib/output.js";

interface SearchResult {
  agents: Array<{
    slug: string;
    name: string;
    description: string;
    tier: string;
    category: string;
    homepage_url: string;
  }>;
  query: string;
}

export async function search(query: string, options: { tier?: string; category?: string }): Promise<void> {
  const params = new URLSearchParams({ q: query });
  if (options.tier) params.set("tier", options.tier);
  if (options.category) params.set("category", options.category);

  const result = await apiRequest<SearchResult>(`/api/v1/agents/search?${params.toString()}`, {
    requireAuth: false,
  });

  if (result.agents.length === 0) {
    console.log(dim(`No agents found for ${result.query}`));
    return;
  }

  const rows = result.agents.map((agent) => [
    agent.name,
    tierBadge(agent.tier),
    dim(agent.category),
    dim(agent.homepage_url),
  ]);

  console.log(table(rows));
  console.log(dim(`${result.agents.length} result(s) for ${result.query}`));
}
