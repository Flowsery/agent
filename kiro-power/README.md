# Flowsery power for Kiro

Query web analytics, revenue and the issues found in session recordings from Kiro.

## Install

1. Open the Powers panel in Kiro.
2. Choose **Add Custom Power**, then **Import power from GitHub**.
3. Enter `https://github.com/Flowsery/agent/tree/main/kiro-power` and choose **Install**.

The first tool call opens a browser to sign in with your Flowsery account. There is no API key to set up.

You need a Flowsery account: [flowsery.com](https://flowsery.com).

## What is in this folder

| Path | What it is |
| --- | --- |
| `plugin.json` | The power's manifest and activation keywords. |
| `mcp.json` | The hosted MCP server at `https://mcp.flowsery.com/mcp`. |
| `skills/flowsery/` | How the agent should use the tools. |
