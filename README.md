# Flowsery agent

[![smithery badge](https://smithery.ai/badge/tarasshyn/flowsery)](https://smithery.ai/servers/tarasshyn/flowsery)

Let your AI agent query Flowsery, the privacy-first, cookie-free web analytics: live visitors, traffic breakdowns, goals, revenue, visitor journeys, and the bugs Flowsery's AI found in session recordings.

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

## The MCP server

Flowsery runs this server at `https://mcp.flowsery.com/mcp`. An OAuth-capable client needs only the URL and signs in in the browser; that sign-in reaches every workspace you belong to. A client without OAuth sends an API key:

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

The server reads analytics, visitors and issues, records goal events and changes an issue's status. Recording payments is only in the skill.

To run it yourself over stdio with [Bun](https://bun.sh):

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

The tools and the local options are in [`mcp-server/README.md`](./mcp-server/README.md).

## Links

- [Flowsery](https://flowsery.com)
- [AI agents](https://flowsery.com/features/agents)
- [API documentation](https://flowsery.com/docs/api-introduction)
- [API tokens](https://flowsery.com/api-tokens)
- [Claude Code and Hermes plugin](https://github.com/Flowsery/claude-plugin)
- Privacy policy: [flowsery.com/privacy](https://flowsery.com/privacy)

## License

MIT
