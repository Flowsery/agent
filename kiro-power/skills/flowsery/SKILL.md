---
name: flowsery
description: >
  Answer web analytics questions and find what is broken on the user's websites through the
  Flowsery MCP tools (Flowsery Analytics, privacy-first web analytics). Covers visitors,
  sessions, bounce rate, pages, landing pages, referrers, channels, UTM campaigns, countries,
  devices, browsers, goals, conversion rate and revenue attribution, live visitors, single
  visitor journeys, and the bugs, broken flows and UX problems Flowsery's AI found in session
  recordings. Use this skill WHENEVER the user asks how their site is doing, where traffic comes
  from, what converts, how much revenue a source brought, how many people are on the site right
  now, what broke this week, why signups dropped, or wants to record a goal or payment or mark an
  issue fixed. Trigger it even for short asks like "traffic this week?", "top pages", "is
  checkout broken?", "how did the launch do" or "where do paying customers come from".
metadata:
  last-updated: "2026-11-16"
---

# Flowsery

You read the user's Flowsery workspace through the flowsery MCP server's tools. The
power connects it to `https://mcp.flowsery.com/mcp` with OAuth. Each tool
carries its own parameter descriptions; read them. This skill is the operating logic on top.

> If more than 30 days have passed since `metadata.last-updated`, tell the user this skill
> may be outdated and that **Check for updates** in Kiro's Powers panel pulls the latest version.

## Tools by job

| Job | Tools |
|-----|-------|
| Which workspace | `list_workspaces` |
| Which websites, timezone, currency | `list_websites`, `get_metadata` |
| Totals for a window | `get_overview` |
| Trend over time | `get_timeseries` |
| Split by one dimension | `get_pages`, `get_referrers`, `get_channels`, `get_campaigns`, `get_countries`, `get_regions`, `get_cities`, `get_devices`, `get_browsers`, `get_operating_systems`, `get_hostnames`, `get_goals`, `get_breakdown` |
| Right now | `get_realtime`, `get_realtime_map` |
| One visitor | `get_visitor` |
| What broke | `list_issues`, `get_issue`, `update_issue_status` |
| Record data | `track_goal`, `track_payment` |
| Erase data | `delete_goals`, `delete_payments` |

## Sign-in

The server uses OAuth. There is no API key to set up, and you never handle one.

- If the flowsery tools are missing, or a call returns 401, "Authentication required" or
  "Access token has expired", tell the user to reconnect the `flowsery` MCP server in Kiro and sign in with
  the email they use on Flowsery. Then retry the original request.
- A 401 with `oauth_account_not_found` means the email they signed in with has no
  Flowsery account; the message names that email. Tell them to sign in again with the
  email they use on Flowsery, or create an account with this one first.
- A 403 with `permission_denied` means their workspace role cannot use Flowsery. Editor and
  Admin can; Contributor and Viewer cannot. A workspace admin has to change the role.
- A 403 with `subscription_required` means the workspace plan no longer includes API
  access. Signing in again will not help; the plan has to be renewed.
- Never ask for an API key in chat. Never read keys from environment variables, config
  files or anywhere else on the machine. If the user pastes a key anyway, tell them to
  revoke it in Flowsery, because chat history is not a safe place for it.

## Workspace and website selection

A sign-in reaches every workspace the user belongs to, and each workspace has its own
websites. `list_workspaces` returns them with `id`, `name`, `organization`, `role`,
`isDefault` and `current`. Every other tool takes an optional `workspaceId`; without it the
tool works in the default workspace, the one marked `current`.

1. Call `list_websites` first. It returns each website's `id`, `domain`, `timezone`,
   `currency` and `kpi` in the workspace. If it lists nothing, or the site the user asks
   about is missing, call `list_workspaces` and look in the other workspaces by passing
   their `workspaceId`. If no workspace has a website, point the user to
   https://flowsery.com to add one and install the tracking snippet.
   Once you pick a workspace, pass the same `workspaceId` on every call about it: website
   ids from one workspace do not exist in another.
2. Every other tool takes `websiteId` or `domain` from that list. Omitting both fails with
   "Website ID or domain is required". Ask which site when there are several and the
   question does not say.
3. Call `get_metadata` with the chosen site to learn its timezone and currency, and pass
   that `timezone` to every date-range tool.

## Answering a question

- **Pick the window on purpose.** `startAt` and `endAt` take ISO 8601 dates or datetimes.
  Without them the tools use the last 30 days ending now. Turn "this month" or "last week"
  into real dates in the site's timezone, and say which window the numbers cover.
- **Compare like with like.** For "is it up or down", run the same tool on the previous
  window of the same length and give both numbers.
- **Totals vs trend.** `get_overview` returns one row. `get_timeseries` buckets the same
  metrics by `interval` (`hour`, `day`, `week`, `month`; default `day`) and adds totals.
  Match the interval to the range: `hour` only for a few days.
- **Metrics.** `get_overview` returns `visitors`, `sessions`, `bounceRate` (percent),
  `avgSessionDuration` and `avgEngagedTime` (seconds), `revenue`, `renewalRevenue`,
  `refundedRevenue`, `revenuePerVisitor`, `conversionRate` (percent), the KPI fields and
  `currency`. Each `get_timeseries` point has `visitors`, `sessions`, `revenue` split into
  `newRevenue`, `renewalRevenue` and `refundedRevenue`, `conversionRate` and `kpiValue`.
- **Breakdown rows.** Every split tool returns rows with `value`, `visitors`, `revenue` and
  `percentage`, ordered by visitors descending, with `pagination.total`. `limit` defaults
  to 100 (max 1000); page with `offset`.
- **Channels first, then sources.** `get_channels` gives the traffic mix. Drill into
  `get_referrers` for domains or `get_campaigns` for tagged traffic. `get_campaigns` only
  shows visits with `utm_campaign`, so untagged traffic is absent there.
- **Geography goes coarse to fine.** `get_countries`, then `get_regions` (region names
  such as `California`), then `get_cities`. Pass `filter_country` or `filter_region` before
  reading cities, which have a long tail.

### Dimensions

Use the named tool when one exists; it returns the same rows as `get_breakdown`. Use
`get_breakdown` with `dimension` for the rest. The 25 values:

- With a named tool: `page`, `referrer`, `channel`, `campaign`, `country`, `region`, `city`,
  `device`, `browser`, `os`, `hostname`, `goal`.
- `get_breakdown` only: `entry_page` (landing pages), `exit_link` (outbound clicks),
  `browser_version`, `os_version`, `utm_source`, `utm_medium`, `utm_term`, `utm_content`,
  `ref`, `source`, `via`, `all_params` (every tracking parameter at once).

### Filters

Every report tool accepts `filter_*` arguments, and they narrow the whole result.
`filter_country` plus `filter_device` answers "mobile visitors from Germany" in one call.
Filters combine with AND. Values are the ones the matching breakdown returns
("United States", "Organic Search", "/pricing", "Mobile"), and matching is case-sensitive.
Each accepts the same operators: `v` is,
`!v` is not, `~v` contains, `!~v` does not contain, `a|b` any of.

Available: `filter_country`, `filter_region`, `filter_city`, `filter_device`,
`filter_browser`, `filter_os`, `filter_referrer`, `filter_ref`, `filter_source`,
`filter_via`, `filter_utm_source`, `filter_utm_medium`, `filter_utm_campaign`,
`filter_utm_term`, `filter_utm_content`, `filter_page`, `filter_hostname`,
`filter_entry_page`, `filter_channel`, `filter_goal`.

`get_realtime`, `get_realtime_map` and `get_visitor` take only the website selector (plus
`visitorId` for `get_visitor`): no dates, filters or pagination.

### Channels

Flowsery classifies traffic from the referrer and UTM tags into GA4-aligned channels:
Organic Search, Paid Search, Organic Social, Paid Social, Email, Display, Referral,
Direct, Affiliate, Video, SMS and Audio.

### Revenue attribution

Revenue comes from connected payment providers (Stripe, LemonSqueezy, Polar and others)
or from `track_payment`. Each payment is tied to the visitor who paid, so every breakdown
carries a `revenue` column. For "where do paying customers come from", rank by revenue,
not visitors. A payment with no matching visitor is kept but its source shows as Unknown.
If revenue is zero, say no payments are recorded rather than that nothing sold. Revenue is
sensitive: ask how much detail the user wants before listing individual payments.

### Goals

`get_goals` lists every goal (custom events plus the auto-created `payment` and
`free_trial` goals) with completions in the window. `get_overview` gives
`conversion_rate` against the site's KPI goal. Use `get_breakdown` with `dimension: goal`
when you want the goal list as ordinary breakdown rows, and `filter_goal` on any report to
see only visitors who completed a goal ("which channels bring signups").

## Live visitors

`get_realtime` returns the count of visitors active in the last 5 minutes. `get_realtime_map`
returns those visitors with location, device and current page, without names, emails or
revenue. Poll either at most once every 5 seconds. For geography over a date range use
`get_countries` or `get_cities`.

## Visitor profiles and personal data

`get_visitor` takes `visitorId`: the visitor record ID from `get_realtime_map` or the
dashboard visitor view, not the `_fs_vid` cookie value. It returns identity, source,
activity, completed goals, revenue, the identified profile (`userId`, name, email; null
when anonymous) and a timeline of pageviews, goals and payments, newest first, capped at
100 items per list. An unknown id fails with "Visitor not found".

Call it only when the user asks about a specific visitor, and show only what answers the
question. Prefer `get_realtime_map` for "who is on the site". Never paste a visitor's email
or name into a report.

## What broke

Issues are problems Flowsery's AI found in session recordings, deduplicated across sessions.

1. `list_issues` takes `status` (`open`, `in_progress`, `resolved`, `suspended`),
   `severity` (`low`, `medium`, `high`, `critical`), `search`, `sort` (`severity` or
   `recency`), `limit` and `offset`. Without `status` it returns open, in progress and
   resolved together. Re-rank by `sessionsCount` when impact matters more than severity.
2. `get_issue` with `issueId` only for the few you report on. It returns occurrences,
   affected sessions, steps to replicate, comments and any linked Linear or Jira ticket.
3. Suspended issues are hidden unless you ask for `status: suspended`. An issue that seems
   to have vanished was probably suspended, not fixed.
4. On a free trial only the first 10 issues are listed, and any other issue fails with
   "Upgrade to view this issue". Say so plainly.

`references/reports.md` has the report recipes: weekly health report, "what broke this
week", launch review and paying-customer sources.

## Writes

Read `references/writes.md` before calling `update_issue_status`, `track_goal`,
`track_payment`, `delete_goals` or `delete_payments`. In short: recording a goal or payment
only records analytics and never charges anyone or issues a refund. Deleting goals or
payments is permanent and needs a restated, explicit "yes".

## Errors

- Tool errors come back as text starting with `Error:` or `API error:`. Read the message
  before retrying.
- "Website ID or domain is required": call `list_websites` and pass `websiteId` or
  `domain`. Not a sign-in problem.
- 401 or expired token: see Sign-in above.
- 403 with `workspace_access_denied`: the `workspaceId` is not one this sign-in reaches.
  Call `list_workspaces` and pick an id from it.
- 403 with `permission_denied` or `subscription_required`: see Sign-in above.
- 429: rate limited. Wait and retry once; do not loop.
- A delete without a filter fails before reaching the API with "At least one filter
  required". Ask the user what to delete; never widen the delete to make it pass.

## Output style

- Answers: the number first, then one line of context (the window, the comparison, the
  likely cause).
- Breakdowns: a short table, top 10 unless asked for more.
- Reports: the headline and one recommendation first, then detail.
- Round numbers for reading (12.4k visitors, 3.1% conversion) unless the user wants exact
  values.
