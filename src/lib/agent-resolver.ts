import { apiRequest, ApiError } from "./api.js";

export interface ResolvedAgent {
  slug: string;
  name: string;
  description: string;
  tier: string;
  category: string;
  tags: string[];
  homepage_url: string | null;
  icon_url: string | null;
  base_url: string | null;
  openapi_spec: Record<string, unknown> | null;
  x402_pricing_manifest: Record<string, unknown> | null;
  verified_at: string | null;
  smoke_test_passed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AgentCardResponse {
  schema_version: string;
  slug: string;
  name: string;
  description: string;
  tier: string;
  category: string;
  tags: string[];
  homepage_url: string | null;
  icon_url: string | null;
  base_url: string | null;
  verified_at: string | null;
  smoke_test_passed_at: string | null;
  openapi_spec: Record<string, unknown> | null;
  x402_pricing_manifest: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  links: {
    list: string;
    platform: string;
  };
}

interface SearchResponse {
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

function toResolvedAgent(card: AgentCardResponse): ResolvedAgent {
  return {
    slug: card.slug,
    name: card.name,
    description: card.description,
    tier: card.tier,
    category: card.category,
    tags: card.tags,
    homepage_url: card.homepage_url,
    icon_url: card.icon_url,
    base_url: card.base_url,
    openapi_spec: card.openapi_spec,
    x402_pricing_manifest: card.x402_pricing_manifest,
    verified_at: card.verified_at,
    smoke_test_passed_at: card.smoke_test_passed_at,
    created_at: card.created_at,
    updated_at: card.updated_at,
  };
}

/**
 * Resolve an agent slug (or partial name) to full agent details.
 *
 * Resolution order:
 * 1. Try exact slug via GET /.well-known/agents/{slug}
 * 2. If 404, search via GET /api/v1/agents/search?q={slug}
 * 3. If exactly one search result, fetch its full detail
 * 4. If multiple results, throw listing the matches
 * 5. If zero results, throw
 */
export async function resolveAgent(slugOrPartial: string): Promise<ResolvedAgent> {
  // 1. Try exact slug lookup
  try {
    const card = await apiRequest<AgentCardResponse>(
      `/.well-known/agents/${encodeURIComponent(slugOrPartial)}`,
      { requireAuth: false },
    );
    return toResolvedAgent(card);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) {
      throw err;
    }
    // 404 — fall through to search
  }

  // 2. Search for the agent
  const params = new URLSearchParams({ q: slugOrPartial });
  const searchResult = await apiRequest<SearchResponse>(
    `/api/v1/agents/search?${params.toString()}`,
    { requireAuth: false },
  );

  // 5. Zero results
  if (searchResult.agents.length === 0) {
    throw new Error(`No agent found matching "${slugOrPartial}"`);
  }

  // 4. Multiple results
  if (searchResult.agents.length > 1) {
    const matches = searchResult.agents
      .map((a) => `  ${a.slug} — ${a.name}`)
      .join("\n");
    throw new Error(
      `Multiple agents match "${slugOrPartial}". Be more specific:\n${matches}`,
    );
  }

  // 3. Exactly one result — fetch full detail
  const match = searchResult.agents[0];
  const card = await apiRequest<AgentCardResponse>(
    `/.well-known/agents/${encodeURIComponent(match.slug)}`,
    { requireAuth: false },
  );
  return toResolvedAgent(card);
}
