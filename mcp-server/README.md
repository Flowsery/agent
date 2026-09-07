# Flowsery MCP Server

MCP server for Flowsery Analytics.

## Setup

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
