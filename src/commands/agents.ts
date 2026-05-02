import { apiRequest } from "../lib/api.js";
import { bold, dim, tierBadge, table } from "../lib/output.js";

interface AgentsResult {
  agents: Array<{
    slug: string;
    name: string;
    description: string;
    tier: string;
    category: string;
    homepage_url: string;
  }>;
  count: number;
}

export async function agents(options: { tier?: string; category?: string }): Promise<void> {
  const params = new URLSearchParams({ limit: "100" });
  if (options.tier) params.set("tier", options.tier);
  if (options.category) params.set("category", options.category);

  const result = await apiRequest<AgentsResult>(`/api/v1/agents?${params.toString()}`, {
    requireAuth: false,
  });

  if (result.agents.length === 0) {
    console.log(dim("No agents in the registry."));
    return;
  }

  const grouped = new Map<string, AgentsResult["agents"]>();
  for (const agent of result.agents) {
    const group = grouped.get(agent.category);
    if (group) {
      group.push(agent);
    } else {
      grouped.set(agent.category, [agent]);
    }
  }

  for (const [category, categoryAgents] of grouped) {
    console.log(bold(category));
    const rows = categoryAgents.map((agent) => {
      const truncated = agent.description.length > 60
        ? agent.description.slice(0, 57) + "..."
        : agent.description;
      return [`  ${agent.name}`, tierBadge(agent.tier), dim(truncated)];
    });
    console.log(table(rows));
    console.log();
  }

  console.log(dim(`${result.count} agent(s) total`));
}
