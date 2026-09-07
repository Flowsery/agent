---
name: flowsery
description: >
  Query web analytics data from Flowsery Analytics — a privacy-first web analytics platform.
  Retrieve real-time visitor counts, time series data, breakdowns by 24 dimensions (device,
  page, country, referrer, campaign, channel, UTM params, exit links, etc.), visitor profiles
  with activity timelines, custom goal tracking, and revenue attribution.
last-updated: 2026-09-07
allowed-tools: Bash(./scripts/flowsery.js:*)
---

# Flowsery Analytics Skill

Autonomously query and manage web analytics via [Flowsery Analytics](https://flowsery.com) API. Privacy-first analytics with real-time data, revenue tracking, and 24 breakdown dimensions.

> **Freshness check**: If more than 30 days have passed since the `last-updated` date above, inform the user that this skill may be outdated and point them to the update options below.

## Keeping This Skill Updated

**Source**: [github.com/flowsery/agent](https://github.com/flowsery/agent)

Update methods by installation type:

| Installation       | How to update                                       |
| ------------------ | --------------------------------------------------- |
| CLI (`npx skills`) | `npx skills update`                                 |
| Claude Code plugin | `/plugin marketplace update`                        |
| Cursor             | Remote rules auto-sync from GitHub                  |
| Manual             | Pull latest from repo or re-copy `skills/flowsery/` |

## Setup

1. Create a Flowsery account at [flowsery.com](https://flowsery.com)
2. Add your website and install the tracking snippet
3. Go to the workspace-level **API Tokens** page and create a workspace API token for API/MCP/OpenClaw access
4. Store your API key in workspace `.env`:
   ```
   FLOWSERY_API_KEY=flow_ws_xxxxx
   ```

Or run the setup command:

```
./scripts/flowsery.js setup --key flow_ws_xxxxx
```

Token types:

- Workspace API tokens start with `flow_ws_`. Use these for agents, MCP, OpenClaw, and multi-website API access. They can list and query every website in the workspace.
- Website API keys start with `flow_`. Use these only for a single website, especially server-side event ingestion such as custom goals and payments.
- When using a workspace token, call `websites` first and then pass `--website-id <id>` or `--domain <domain>` to analytics commands.

## Auth

All requests use Bearer token:

```
Authorization: Bearer <API_KEY>
```

Base URL: `https://analytics.flowsery.com/analytics`

**Config priority** (highest to lowest):

1. `FLOWSERY_API_KEY` environment variable
2. `./.flowsery/config.json` (project-local)
3. `~/.config/flowsery/config.json` (user-global)

### Handling "API key not found" errors

When you receive an "API key not found" error from the CLI:

1. **Tell the user to run the setup command** — setup requires user input, so you cannot run it on their behalf:
   ```bash
   ./scripts/flowsery.js setup --key flow_ws_xxxxx
   ```
2. **Stop and wait** — do not continue with the task. You cannot query analytics or perform any API operations without a valid API key.
3. **DO NOT** search for API keys in env files, keychains, or other locations.

Get your API key at: https://flowsery.com/api-tokens

> **Note for agents**: All script paths in this document (e.g., `./scripts/flowsery.js`) are relative to the skill directory where this SKILL.md file is located. Resolve them accordingly based on where the skill is installed.

## CLI Commands

### Setup & Info

| Command                                   | Description                                          |
| ----------------------------------------- | ---------------------------------------------------- |
| `./scripts/flowsery.js setup --key <key>` | Configure API key                                    |
| `./scripts/flowsery.js websites`          | List websites the token can read (id, domain, timezone, currency, KPI). Call first with a workspace token |
| `./scripts/flowsery.js metadata`          | Website settings (domain, timezone, currency, KPI). Without `--website-id` on a workspace token it returns the website list |
| `./scripts/flowsery.js help`              | List all available commands                          |

### Analytics Queries

| Command                                           | Description                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `./scripts/flowsery.js overview`                  | Headline totals for a date range as one row (visitors, sessions, bounce rate, revenue, conversion rate). Default window: last 30 days |
| `./scripts/flowsery.js timeseries --interval day` | The same metrics bucketed by hour/day/week/month with totals. Use for trends; match the interval to the range |
| `./scripts/flowsery.js realtime`                  | Visitors active in the last 5 minutes. No date or filter flags, no history; poll at most every 5 s |
| `./scripts/flowsery.js realtime:map`              | Active visitors with geographic location for a live map. Use `countries`/`cities` for geography over a date range |

### Breakdown Reports

All breakdown commands return rows with `value`, `visitors`, `revenue` and `percentage`, ordered by visitors descending, plus `pagination.total`. They accept the date range (default: last 30 days), `--limit` (default 100, max 1000), `--offset` and every filter flag.

| Command                                             | Description                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `./scripts/flowsery.js pages`                       | Page paths ranked by visitors. Use `breakdown --dimension entry_page` for landing pages, `exit_link` for outbound clicks        |
| `./scripts/flowsery.js referrers`                   | Referring domains. Use `channels` for the GA4-style mix and `campaigns` for UTM-tagged traffic                                |
| `./scripts/flowsery.js countries`                   | Visitors by country (coarsest geography). Add `--filter_country` to `regions`/`cities` to drill in                            |
| `./scripts/flowsery.js regions`                     | Visitors by region/state (ISO 3166-2 code such as `US-CA`)                                                                   |
| `./scripts/flowsery.js cities`                      | Visitors by city. Long tail: filter by country or region first, or raise `--limit`                                           |
| `./scripts/flowsery.js devices`                     | Desktop vs mobile vs tablet (three rows). `browsers`/`operating-systems` give the software split                             |
| `./scripts/flowsery.js browsers`                    | Browser names only. Versions via `breakdown --dimension browser_version`                                                     |
| `./scripts/flowsery.js operating-systems`           | OS names only. Versions via `breakdown --dimension os_version`                                                               |
| `./scripts/flowsery.js campaigns`                   | `utm_campaign` values; untagged traffic is absent. Other UTM params via `breakdown --dimension utm_source` etc.               |
| `./scripts/flowsery.js hostnames`                   | Visitors per hostname, for sites tracking several domains or subdomains                                                      |
| `./scripts/flowsery.js channels`                    | GA4-aligned channels (Organic Search, Paid Social, Direct...) from referrer and UTM. Start here for the traffic mix           |
| `./scripts/flowsery.js goals`                       | Every goal (including auto-created `payment`/`free_trial`) with completions in the window. Filter and limit flags are ignored |
| `./scripts/flowsery.js breakdown --dimension <dim>` | Any of 24 dimensions; the only route to `entry_page`, `exit_link`, `*_version`, `utm_*`, `ref`, `source`, `all_params`       |

### Visitor Data

| Command                                           | Description                                 |
| ------------------------------------------------- | ------------------------------------------- |
| `./scripts/flowsery.js visitor --id <visitor_id>` | Full profile of one visitor (PII) with a newest-first timeline; lists hold the 100 most recent items; unknown ids return 404 |

### Goal Tracking

| Command                                                                  | Description                  |
| ------------------------------------------------------------------------ | ---------------------------- |
| `./scripts/flowsery.js goals:create --name "signup" --visitor-uid <uid>` | Append one goal completion. The goal is created on first use; repeating the call counts it twice. Omit `--visitor-uid` for an anonymous completion |
| `./scripts/flowsery.js goals:delete --name "signup"`                     | Permanently delete completions matching all given filters (AND). Needs at least one of `--visitor-id`, `--name`, `--start-at`, `--end-at`; confirm first |

### Revenue Tracking

| Command                                                                                        | Description                      |
| ---------------------------------------------------------------------------------------------- | -------------------------------- |
| `./scripts/flowsery.js payments:create --amount 29.99 --currency USD --transaction-id pay_123` | Record a payment. The transaction id must be unique; `--refund` with an existing id marks that payment refunded instead of adding a record. Also records a `payment` goal |
| `./scripts/flowsery.js payments:delete --transaction-id pay_123`                               | Permanently delete payments matching all given filters (AND). Needs at least one of `--transaction-id`, `--visitor-id`, `--start-at`, `--end-at`; prefer `--refund` to keep history |

### Common Flags (all query commands)

| Flag                   | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `--startAt <ISO date>` | Start of date range (e.g. `2026-01-01`). Default: 30 days ago   |
| `--endAt <ISO date>`   | End of date range (e.g. `2026-01-31`). Default: now             |
| `--timezone <IANA>`    | Timezone (e.g. `America/New_York`). Falls back to site default. |
| `--limit <n>`          | Max rows (1-1000, default: 100), ordered by visitors descending |
| `--offset <n>`         | Rows to skip; compare with `pagination.total`                   |
| `--fields <list>`      | Comma-separated metrics to include                              |
| `--website-id <id>`    | Website to query when using a workspace token                   |
| `--domain <domain>`    | Website domain to query when using a workspace token            |

### Filter Flags (all query commands)

Filters combine with AND. Values are the ones the matching breakdown returns, and every filter accepts the same operators: `v` is, `!v` is not, `~v` contains, `!~v` does not contain, `a|b` any of.

| Flag                            | Description                                     |
| ------------------------------- | ----------------------------------------------- |
| `--filter_country <value>`      | Filter by country                               |
| `--filter_region <value>`       | Filter by region                                |
| `--filter_city <value>`         | Filter by city                                  |
| `--filter_device <value>`       | Filter by device type (desktop, mobile, tablet) |
| `--filter_browser <value>`      | Filter by browser                               |
| `--filter_os <value>`           | Filter by operating system                      |
| `--filter_referrer <value>`     | Filter by referrer domain                       |
| `--filter_ref <value>`          | Filter by `ref` URL parameter                   |
| `--filter_source <value>`       | Filter by `source` URL parameter                |
| `--filter_via <value>`          | Filter by `via` URL parameter                   |
| `--filter_utm_source <value>`   | Filter by UTM source                            |
| `--filter_utm_medium <value>`   | Filter by UTM medium                            |
| `--filter_utm_campaign <value>` | Filter by UTM campaign                          |
| `--filter_utm_term <value>`     | Filter by UTM term                              |
| `--filter_utm_content <value>`  | Filter by UTM content                           |
| `--filter_page <value>`         | Filter by page path                             |
| `--filter_hostname <value>`     | Filter by hostname                              |
| `--filter_entry_page <value>`   | Filter by entry page                            |
| `--filter_channel <value>`      | Filter by marketing channel                     |
| `--filter_goal <value>`         | Filter by goal name                             |

## Breakdown Dimensions

Use these exact values with `breakdown --dimension`:

`device`, `page`, `entry_page`, `exit_link`, `hostname`, `referrer`, `channel`, `campaign`, `goal`, `country`, `region`, `city`, `browser`, `browser_version`, `os`, `os_version`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `ref`, `source`, `all_params`

## Time Series Intervals

| Interval | Description                                  |
| -------- | -------------------------------------------- |
| `hour`   | Hourly buckets (defaults to last 24h)        |
| `day`    | Daily buckets (defaults to last 30 days)     |
| `week`   | Weekly buckets (defaults to last 30 days)    |
| `month`  | Monthly buckets (defaults to last 12 months) |

## Marketing Channels

Flowsery auto-classifies traffic into GA4-aligned channels:

- **Organic Search** — Google, Bing, DuckDuckGo, etc.
- **Paid Search** — utm_medium: cpc, ppc, paid_search
- **Organic Social** — Facebook, Twitter, LinkedIn, Reddit, etc.
- **Paid Social** — utm_medium: paid_social, social_cpc
- **Email** — utm_medium: email, newsletter
- **Display** — utm_medium: display, banner, cpm
- **Referral** — Other websites
- **Direct** — No referrer
- **Affiliate** — utm_medium: affiliate, partner
- **Video** — utm_medium: video
- **SMS** — utm_medium: sms
- **Audio** — utm_medium: audio, podcast

## MCP Integration

Flowsery has a native MCP server. If you're using Claude Desktop, Cursor, or any MCP-compatible client, you can connect directly.

**Claude Code / Cursor / Other MCP clients** — add to your MCP config:

```json
{
  "mcpServers": {
    "flowsery": {
      "type": "http",
      "url": "https://mcp.flowsery.com/mcp",
      "headers": {
        "Authorization": "Bearer flow_ws_your_key"
      }
    }
  }
}
```

## Automation Guidelines

- **Read-only by default** — most commands are safe GET queries with no side effects
- **Delete with caution** — `goals:delete` and `payments:delete` are irreversible; always confirm with the user before running
- **Revenue data is sensitive** — when displaying payment or revenue data, ask the user about the appropriate level of detail
- **Rate limits** — avoid polling `realtime` more than once per 5 seconds
- **Date ranges** — when the user says "this month" or "last week", calculate the actual ISO dates; without dates the API uses the last 30 days ending now, so say which window the numbers cover
- **Refunds** — reverse a charge with `payments:create --refund` and the original transaction id; `payments:delete` erases the record from every report
- **Workspace tokens** — always call `websites` first, choose the correct website, and include `--website-id` or `--domain` on subsequent commands
- **Timezone** — call `metadata --website-id <id>` first to get the site's timezone; use it for all subsequent queries

## Tips

- Call `websites` first when using a workspace token; then call `metadata --website-id <id>` to get the site timezone and currency
- Use `overview` for a quick health check of the site
- Use `timeseries --interval day` for trend analysis and charting
- Combine filters to drill down: `--filter_country "United States" --filter_device mobile`
- Use `breakdown --dimension all_params` to see all tracking parameter performance at once
- Check `realtime` before and after deploying content changes to see immediate impact
- Use `visitor --id <id>` to build a full picture of a specific user's journey
- For revenue questions, use `overview --fields revenue,conversion_rate` or `timeseries --fields revenue`
- Use `channels` to understand your traffic mix before drilling into specific sources with `referrers` or `campaigns`
- Use `breakdown --dimension entry_page` for landing pages; `pages` ranks every page viewed
- `goals` ignores filter and limit flags; use `breakdown --dimension goal` when you need them
