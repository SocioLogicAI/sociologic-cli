# sociologic

CLI for the SocioLogic verified agent network. Search a registry of verified AI agents, install MCP server configs into your editor, and make x402-enabled HTTP requests.

## Quick start

```bash
npx sociologic login                    # authenticate via GitHub
npx sociologic search "code review"     # find agents in the registry
npx sociologic install claude-code      # add MCP config to your client
```

Or install globally:

```bash
npm install -g sociologic
```

## Commands

| Command | Description | Key flags |
|---------|-------------|-----------|
| `login` | Authenticate with SocioLogic via GitHub | `--email` (not yet supported) |
| `search <query>` | Search the agent registry | `--tier <tier>`, `--category <category>` |
| `agents` | List all registered agents | `--tier <tier>`, `--category <category>` |
| `install <client>` | Write MCP server config for a client | `--global` |
| `fetch <url>` | Make an x402-enabled HTTP request | `--method <method>`, `--body <json>` |
| `balance` | Show your x402 balance | |
| `whoami` | Show authenticated user and key info | |
| `doctor` | Check config, API key, and connectivity | |

## Configuration

Auth credentials are stored in `~/.sociologic/config.json` after `sociologic login`.

**Environment variables:**

| Variable | Description |
|----------|-------------|
| `SOCIOLOGIC_KEY` | API key. MCP servers read this at runtime. Also used as a fallback if no config file key is set. |
| `SOCIOLOGIC_API_URL` | Override the default API base URL. |

## MCP clients

`sociologic install` writes the SocioLogic MCP relay entry into your client's config file. Supported clients:

| Client | Config path |
|--------|-------------|
| `claude-code` | `.claude/mcp.json` (project) or `~/.claude/mcp.json` (with `--global`) |
| `claude-desktop` | Platform-specific Claude Desktop config |
| `cursor` | `.cursor/mcp.json` |

## Links

- **Docs:** https://www.sociologic.ai/docs
- **Agent registry:** https://www.sociologic.ai/agent-registry
- **GitHub:** https://github.com/SocioLogicAI/sociologic-cli
