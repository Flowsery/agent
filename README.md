# Flowsery Agent

[![smithery badge](https://smithery.ai/badge/tarasshyn/flowsery)](https://smithery.ai/servers/tarasshyn/flowsery)

Give your AI agent the ability to query web analytics — real-time visitors, traffic breakdowns, revenue, goals, and visitor profiles.

**Privacy-first, cookie-free analytics.** Alternative to Google Analytics.

## Install

```bash
npx skills add flowsery/agent
```

Works with Claude Code, Cursor, Windsurf, Codex, and any agent that supports skills.

### Other installation methods

**Manual**: Copy the `skills/flowsery/` folder into your project's skills directory.

**Cursor remote rules**: Point to `https://raw.githubusercontent.com/flowsery/agent/main/skills/flowsery/SKILL.md`

## Setup

1. Create an account at [flowsery.com](https://flowsery.com)
2. Add your website and install the tracking snippet
3. Create an API key at [Site Settings > API](https://flowsery.com/api-tokens)
4. Run:
   ```bash
   ./scripts/flowsery.js setup --key flow_sk_live_xxxxx
   ```

## What it does

Once installed, your AI agent can:

- **Overview** — aggregated site metrics (visitors, sessions, bounce rate, revenue)
- **Time series** — trend data by hour, day, week, or month
- **Realtime** — current active visitor count and geographic map
- **Breakdowns** — top pages, referrers, countries, devices, browsers, OS, campaigns, channels, and 20+ dimensions
- **Visitor profiles** — full journey with identity, activity timeline, revenue, and identified user info
- **Goal tracking** — track custom events with metadata
- **Revenue tracking** — record payments for attribution (Stripe/LemonSqueezy/Polar auto-tracked)
- **Filters** — drill down by country, device, browser, UTM params, page, channel, and more

## Example

```
You: How's my traffic this week?
Agent: Your site had 2,847 visitors and 3,912 sessions this week.
       Bounce rate is 62%. Revenue: $1,240 from 18 conversions.
       Top sources: Google (41%), Direct (28%), Twitter (12%).
```

## Alternative: MCP

For deeper integration with Claude Desktop, Cursor, or other MCP-compatible clients, use the Flowsery MCP server:

```json
{
  "mcpServers": {
    "flowsery": {
      "type": "http",
      "url": "https://mcp.flowsery.com/mcp",
      "headers": {
        "Authorization": "Bearer flow_sk_live_your_key"
      }
    }
  }
}
```

### Run it locally

The server source lives in [`mcp-server/`](./mcp-server). Run it over stdio with [Bun](https://bun.sh):

```json
{
  "mcpServers": {
    "flowsery": {
      "command": "bun",
      "args": ["run", "/path/to/agent/mcp-server/src/index.ts"],
      "env": { "FLOWSERY_API_KEY": "flow_sk_live_your_key" }
    }
  }
}
```

Or with Docker:

```bash
docker build -t flowsery-mcp .
docker run -i -e FLOWSERY_API_KEY=flow_sk_live_your_key flowsery-mcp
```

## Links

- [MCP Server](./mcp-server)
- [Flowsery](https://flowsery.com)
- [API Documentation](https://flowsery.com/docs/api-introduction)
- [API Tokens](https://flowsery.com/api-tokens)

## License

MIT
