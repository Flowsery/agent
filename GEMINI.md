# Flowsery

Flowsery is privacy-first web analytics, revenue tracking and AI-detected session issues. This extension connects Gemini CLI to a Flowsery workspace
over MCP.

## Signing in

The server is at `https://mcp.flowsery.com/mcp`. It answers an unauthenticated call with a 401 and
points at its OAuth metadata, so Gemini CLI opens a browser the first time a tool
runs. Sign in with the Flowsery account that owns the workspace. Nothing needs to be
configured by hand, and no API token is stored in this extension.

## What to ask for

- "how much traffic did we get last week, broken down by referrer?"
- "which AI-detected issues are still open on acme.com?"
- "what is converting on the pricing page?"

## Notes

- Every tool acts on the workspace the signed-in account belongs to.
- Ask before anything that writes. Deletes cannot be undone.
- Read the tool descriptions for the filters each one accepts rather than guessing
  parameter names.

https://flowsery.com
