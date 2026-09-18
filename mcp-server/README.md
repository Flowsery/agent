# Flowsery MCP Server

MCP server for Flowsery Analytics.

## Hosted server

Flowsery runs this server at `https://mcp.flowsery.com/mcp`. Point your MCP client at the URL and sign in when the browser opens. No API key to paste.

Claude Code one-liner:

```bash
claude mcp add --transport http flowsery https://mcp.flowsery.com/mcp
```

Full config for any MCP client (Claude Desktop connectors, ChatGPT, Cursor, Windsurf):

```json
{
  "mcpServers": {
    "flowsery": {
      "type": "http",
      "url": "https://mcp.flowsery.com/mcp"
    }
  }
}
```

An unauthenticated request gets a 401 with a `WWW-Authenticate` challenge, which is how OAuth-capable clients know to open the login screen.

Prefer a key? Add a header with a workspace token from [flowsery.com/api-tokens](https://flowsery.com/api-tokens). Use that for headless agents and clients without OAuth:

```json
"headers": { "Authorization": "Bearer flow_ws_your_key" }
```

Start with `list_websites` either way.

## Local setup

```bash
bun install
export FLOWSERY_API_KEY="flow_ws_xxxxx"
```

Use a workspace API token (`flow_ws_`) for MCP/OpenClaw. It can list and query every website in the workspace; tools should call `list_websites` first and then pass `websiteId` or `domain`. Website-scoped keys (`flow_`) still work, but only for one website.

## Run

Stdio mode:

```bash
bun run src/index.ts
```

HTTP mode:

```bash
bun run src/index.ts --http
```

Environment variables:

- `FLOWSERY_API_KEY`: Flowsery workspace API token or website-scoped key
- `FLOWSERY_API_URL`: optional API base override, defaults to `https://analytics.flowsery.com/analytics/api/v1`
- `PORT`: HTTP port in `--http` mode, defaults to `3100`
