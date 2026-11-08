# Flowsery agent

Let your AI agent query Flowsery, the privacy-first, cookie-free web analytics: live visitors, traffic breakdowns by 25 dimensions, goals, revenue, visitor journeys, and the bugs, broken flows and UX problems Flowsery's AI found in session recordings. 26 MCP tools, OAuth sign-in, no cookies on your site.

## Connect in 30 seconds

```bash
claude mcp add --transport http flowsery https://mcp.flowsery.com/mcp
```

Any other MCP client needs only the URL, `https://mcp.flowsery.com/mcp`. The first call opens a browser to sign in with your Flowsery account. Nothing to install and no key to paste. Setup for each client is [below](#setup-by-client).

## What this repo is

This repo holds every Flowsery agent integration except the Claude Code and Hermes Agent plugin:

| Path | What it is |
| --- | --- |
| [`skills/flowsery/`](./skills/flowsery) | The agent skill for `npx skills add`. It drives the Flowsery REST API through `scripts/flowsery.js` with an API key. |
| [`mcp-server/`](./mcp-server) | Source of the MCP server that runs at `https://mcp.flowsery.com/mcp`. A push to `main` that touches it builds a new image. |
| `gemini-extension.json`, `GEMINI.md` | The Gemini CLI extension. It connects to the hosted MCP server and signs in with OAuth. |
| `Dockerfile`, `glama.json` | Runs the MCP server over stdio, for Glama and anyone who wants it in a container. |
| `lhm.plugin.json` | The LobeHub marketplace listing for the hosted MCP server. |

The Claude Code and Hermes Agent plugin lives in [Flowsery/claude-plugin](https://github.com/Flowsery/claude-plugin). It signs in with OAuth and never asks for an API key, which the Claude plugin directory and the Hermes catalog both require, so it ships its own MCP-only skill instead of the script skill here.

## Pick your install

| You use | Install | Sign-in |
| --- | --- | --- |
| Claude Code | `/plugin install flowsery --marketplace Flowsery/claude-plugin` | OAuth |
| Hermes Agent | `hermes plugins install flowsery` | OAuth |
| Gemini CLI | `gemini extensions install https://github.com/Flowsery/agent` | OAuth |
| Claude Desktop, Cursor, ChatGPT or any MCP client | Add `https://mcp.flowsery.com/mcp` as a remote server | OAuth, or an API key header |
| Cursor, Codex, Windsurf, Claude Code or any agent with skills | `npx skills add Flowsery/agent` | API key |

## Setup by client

The server answers an unauthenticated call with a 401 that points at its OAuth metadata, so every client below opens the Flowsery sign-in on its own. One sign-in reaches every workspace you belong to.

### Claude.ai and Claude Desktop

Open Settings > Connectors, add a custom connector with the URL `https://mcp.flowsery.com/mcp`, and sign in. A Claude Desktop build without connectors can go through `mcp-remote`, which handles the sign-in itself:

```json
{
  "mcpServers": {
    "flowsery": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.flowsery.com/mcp"]
    }
  }
}
```

### Claude Code

The plugin adds the server and a skill that knows how to use it:

```
/plugin install flowsery --marketplace Flowsery/claude-plugin
```

Or add only the server:

```bash
claude mcp add --transport http flowsery https://mcp.flowsery.com/mcp
```

Run `/mcp`, pick `flowsery` and sign in.

### ChatGPT

Add a custom connector in Settings > Apps & Connectors with the URL `https://mcp.flowsery.com/mcp` and sign in.

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "flowsery": { "url": "https://mcp.flowsery.com/mcp" }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "flowsery": { "serverUrl": "https://mcp.flowsery.com/mcp" }
  }
}
```

### VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "flowsery": { "type": "http", "url": "https://mcp.flowsery.com/mcp" }
  }
}
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.flowsery]
url = "https://mcp.flowsery.com/mcp"
```

Then sign in with `codex mcp login flowsery`.

### Gemini CLI

```bash
gemini extensions install https://github.com/Flowsery/agent
```

### Hermes Agent

```bash
hermes plugins install flowsery
hermes plugins enable flowsery
```

### Headless agents and clients without OAuth

Create an API token on [the API tokens page](https://flowsery.com/api-tokens) and send it as a header. Keys start with `flow_ws_`.

```json
{
  "mcpServers": {
    "flowsery": {
      "type": "http",
      "url": "https://mcp.flowsery.com/mcp",
      "headers": { "Authorization": "Bearer flow_ws_your_key" }
    }
  }
}
```

## Example prompts

- "How's my traffic this week compared to last week?"
- "Which channels and campaigns brought paying customers this month?"
- "Visitors dropped on Tuesday. Check pages, referrers and devices and tell me why."
- "How many people are on the site right now, and where are they?"
- "How much traffic did ChatGPT, Perplexity and other AI assistants send us this month?"
- "What did Flowsery find in session recordings this week? Mark the checkout bug as in progress."
- "Show me the journey of the visitor who just started a free trial."
- "Which landing pages convert best for mobile visitors from Germany?"

## Tools

26 tools. Every report takes a date range, a timezone and filters on country, region, city, device, browser, OS, page, hostname, referrer, channel and UTM parameters. Recording payments for revenue attribution is in the agent skill, not the MCP server.

### Workspaces and websites

| Tool | What it does | Changes data |
| --- | --- | --- |
| `list_workspaces` | List the workspaces the sign-in can act in; pass an id as `workspaceId` to any other tool | No |
| `list_websites` | List the websites the token can read, with domain, timezone, currency and KPI goal. Call it first | No |
| `get_metadata` | One website's settings: domain, timezone, currency, KPI goal, logo and colors | No |

### Traffic

| Tool | What it does | Changes data |
| --- | --- | --- |
| `get_overview` | Headline totals for a date range: visitors, sessions, bounce rate, session duration, revenue, revenue per visitor and conversion rate | No |
| `get_timeseries` | The same metrics by hour, day, week or month, with new, renewal and refunded revenue | No |
| `get_realtime` | Visitors active in the last 5 minutes | No |
| `get_realtime_map` | Active visitors with city-level location for a live map; coordinates rounded to 0.1 degrees, no IP addresses | No |

### Breakdowns

| Tool | What it does | Changes data |
| --- | --- | --- |
| `get_pages` | Page paths ranked by visitors | No |
| `get_referrers` | Referring sites ranked by visitors, with known sources such as Google, ChatGPT and Reddit named | No |
| `get_channels` | Traffic grouped into GA4-style channels: Organic Search, Paid Social, Email, Direct and more | No |
| `get_campaigns` | UTM campaigns ranked by visitors | No |
| `get_countries` | Visitors by country | No |
| `get_regions` | Visitors by region or state | No |
| `get_cities` | Visitors by city | No |
| `get_devices` | Desktop, mobile and tablet split | No |
| `get_browsers` | Visitors by browser | No |
| `get_operating_systems` | Visitors by operating system | No |
| `get_hostnames` | Visitors by hostname, for sites that track several domains or subdomains | No |
| `get_breakdown` | Group visitors by any of 25 dimensions, including entry page, exit link, browser and OS versions and every UTM parameter | No |

### Goals and visitors

| Tool | What it does | Changes data |
| --- | --- | --- |
| `get_goals` | Every goal, including the automatic payment and free trial goals, with completions in the window | No |
| `track_goal` | Record one completion of a custom goal; the goal is created on first use | Yes |
| `delete_goals` | Permanently delete goal completions that match the filters | Yes |
| `get_visitor` | One visitor's location, device, source, visits, goals, revenue and timeline | No |

### Session issues

| Tool | What it does | Changes data |
| --- | --- | --- |
| `list_issues` | Bugs, broken flows and UX problems the AI found in session recordings, ranked by severity | No |
| `get_issue` | One issue with its occurrences, sessions, steps to replicate, comments and linked Linear or Jira ticket | No |
| `update_issue_status` | Set an issue to open, in progress, resolved or suspended | Yes |

## Roles, permissions and safety

- Every call runs with the signed-in member's role in the workspace. Reads need `workspace.read`; tracking or deleting goals and changing an issue's status need `flowsery.write`, which Admin and Editor hold.
- Read-only tools carry `readOnlyHint`. Only `track_goal`, `delete_goals` and `update_issue_status` change anything, so clients that confirm writes ask before those three.
- Visitor tools return the analytics of your own websites. `get_realtime_map` rounds coordinates to 0.1 degrees, and no tool returns IP addresses or billing details.
- A website key (`flow_`) reaches one website; a workspace token (`flow_ws_`) or an OAuth sign-in reaches every website in the workspace.

## Workspaces

An OAuth sign-in can reach several workspaces, each with its own data and your own role there. `list_workspaces` returns them, and every other tool takes an optional `workspaceId`, which the server sends as the `X-Workspace-Id` header. Without it a tool works in the workspace `list_workspaces` marks current. A `workspaceId` the sign-in cannot reach answers 403 with `code: workspace_access_denied`. An API key belongs to one workspace.

## The skill

```bash
npx skills add Flowsery/agent
```

Or copy `skills/flowsery/` into your project's skills folder. Cursor can also read it as a remote rule from `https://raw.githubusercontent.com/Flowsery/agent/main/skills/flowsery/SKILL.md`.

### Setup

1. Create an account at [flowsery.com](https://flowsery.com), add your website and install the tracking snippet.
2. Create a workspace API token on the [API tokens page](https://flowsery.com/api-tokens).
3. Run:
   ```bash
   ./scripts/flowsery.js setup --key flow_ws_xxxxx
   ```

### What the agent can do

- Headline totals for any date range: visitors, sessions, bounce rate, revenue and conversion rate
- Trends by hour, day, week or month
- Visitors active right now, with a live map
- Breakdowns by any of 25 dimensions: pages, landing pages, referrers, channels, UTM campaigns, countries, regions, cities, devices, browsers and more
- Filters on country, device, browser, UTM parameters, page and channel
- Goals and their completions, and recording custom goal events
- Recording payments for revenue attribution (Stripe, LemonSqueezy and Polar are tracked automatically)
- One visitor's full journey with their activity timeline
- The issues Flowsery's AI found in session recordings, and changing their status

```
You: How's my traffic this week?
Agent: Your site had 2,847 visitors and 3,912 sessions this week.
       Bounce rate is 62%. Revenue: $1,240 from 18 conversions.
       Top sources: Google (41%), Direct (28%), Twitter (12%).
```

## Run the server yourself

The hosted server is the easy path. To run it yourself over stdio with [Bun](https://bun.sh):

```json
{
  "mcpServers": {
    "flowsery": {
      "command": "bun",
      "args": ["run", "/path/to/agent/mcp-server/src/index.ts"],
      "env": { "FLOWSERY_API_KEY": "flow_ws_your_key" }
    }
  }
}
```

Or in Docker:

```bash
docker build -t flowsery-mcp .
docker run -i -e FLOWSERY_API_KEY=flow_ws_your_key flowsery-mcp
```

`bun run src/index.ts --http` in `mcp-server/` serves the same tools over Streamable HTTP on port 3100, the way `https://mcp.flowsery.com/mcp` runs. Environment variables and local development are in [`mcp-server/README.md`](./mcp-server/README.md).

## FAQ

**Do I need an API key?**
No. Point your client at `https://mcp.flowsery.com/mcp` and sign in with the email you use on Flowsery. Keys are for headless agents and clients without OAuth.

**Does the agent see personal data?**
It sees what your Flowsery dashboard shows for your own websites: approximate location, device, source and activity. No IP addresses, and live map coordinates are rounded.

**Can it change my analytics?**
Only three tools write: `track_goal`, `delete_goals` and `update_issue_status`. Everything else is read-only.

**Does it work with several websites?**
Yes. Call `list_websites` and pass a `websiteId` or `domain` to the report tools.

**What's the difference between this repo and Flowsery/claude-plugin?**
The plugin is the Claude Code and Hermes package: OAuth only, with a skill that drives these MCP tools. This repo has the server's source, the API-key skill for `npx skills add` and the Gemini extension.

## Links

- [Flowsery](https://flowsery.com)
- [AI agents](https://flowsery.com/features/agents)
- [API tokens](https://flowsery.com/api-tokens)
- [Claude Code and Hermes plugin](https://github.com/Flowsery/claude-plugin)
- Privacy policy: [flowsery.com/privacy](https://flowsery.com/privacy)

## License

MIT
