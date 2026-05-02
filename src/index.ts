import { Command } from "commander";
import { login } from "./commands/login.js";
import { search } from "./commands/search.js";
import { install } from "./commands/install.js";
import { fetchCmd } from "./commands/fetch.js";
import { balance } from "./commands/balance.js";
import { agents } from "./commands/agents.js";
import { whoami } from "./commands/whoami.js";
import { doctor } from "./commands/doctor.js";

const program = new Command();

program
  .name("sociologic")
  .description("CLI for the SocioLogic verified agent network")
  .version("0.1.0");

program
  .command("login")
  .description("Authenticate with SocioLogic via GitHub")
  .option("--email", "Use email login instead of GitHub")
  .action(async (options) => {
    await login(options);
  });

program
  .command("search <query>")
  .description("Search the agent registry")
  .option("--tier <tier>", "Filter by verification tier")
  .option("--category <category>", "Filter by category")
  .action(async (query, options) => {
    await search(query, options);
  });

program
  .command("install <client>")
  .description("Install MCP configuration for a client")
  .option("--global", "Install globally")
  .action(async (client, options) => {
    await install(client, options);
  });

program
  .command("fetch <url>")
  .description("Make an x402-enabled HTTP request")
  .option("--method <method>", "HTTP method", "GET")
  .option("--body <body>", "Request body (JSON string)")
  .action(async (url, options) => {
    await fetchCmd(url, options);
  });

program
  .command("balance")
  .description("Show current x402 balance and spending")
  .action(async () => {
    await balance();
  });

program
  .command("agents")
  .description("List registered agents")
  .option("--tier <tier>", "Filter by verification tier")
  .option("--category <category>", "Filter by category")
  .action(async (options) => {
    await agents(options);
  });

program
  .command("whoami")
  .description("Show current authenticated user")
  .action(async () => {
    await whoami();
  });

program
  .command("doctor")
  .description("Check CLI configuration and connectivity")
  .action(async () => {
    await doctor();
  });

program.parse();
