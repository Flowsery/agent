#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createServer, type IncomingMessage } from "node:http";

import { RestClient } from "./rest-client.js";
import {
  oauthConfigFromEnv,
  handleProtectedResourceMetadata,
  sendUnauthorized,
  looksLikeJwt,
  verifyOauthJwt,
} from "./oauth.js";

const isHttpMode = process.argv.includes("--http");
const HTTP_PORT = parseInt(process.env.PORT ?? "3100", 10);

const API_BASE_URL =
  process.env.FLOWSERY_API_URL ??
  "https://analytics.flowsery.com/analytics/api/v1";
const API_TOKEN = process.env.FLOWSERY_API_KEY ?? "";

if (!API_TOKEN && !isHttpMode) {
  console.error(
    "Error: FLOWSERY_API_KEY environment variable is required.\n" +
    "Create a workspace token at https://flowsery.com/api-tokens",
  );
  process.exit(1);
}

const api = new RestClient(API_BASE_URL, API_TOKEN);

const oauthConfig = oauthConfigFromEnv({
  resourceUrl: "https://mcp.flowsery.com/mcp",
  resourceName: "Flowsery",
});

const BreakdownDimension = z.enum([
  "device",
  "page",
  "entry_page",
  "exit_link",
  "hostname",
  "referrer",
  "channel",
  "campaign",
  "goal",
  "country",
  "region",
  "city",
  "browser",
  "browser_version",
  "os",
  "os_version",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
  "all_params",
]);

const TimeInterval = z.enum(["hour", "day", "week", "month"]);

const websiteSelectorFields = {
  websiteId: z
    .string()
    .optional()
    .describe(
      "Website ID to query. Required when using a workspace token unless domain is provided.",
    ),
  domain: z
    .string()
    .optional()
    .describe(
      "Website domain to query. Required when using a workspace token unless websiteId is provided.",
    ),
};

const dateRangeFields = {
  startAt: z
    .string()
    .optional()
    .describe('ISO 8601 start date (e.g. "2026-01-01")'),
  endAt: z
    .string()
    .optional()
    .describe('ISO 8601 end date (e.g. "2026-01-31")'),
  timezone: z
    .string()
    .optional()
    .describe(
      'IANA timezone (e.g. "America/New_York"). Falls back to site default.',
    ),
};

const paginationFields = {
  limit: z.number().optional().describe("Max results (1-1000, default: 100)"),
  offset: z.number().optional().describe("Pagination offset (default: 0)"),
};

const filterFields = {
  filter_country: z.string().optional().describe("Filter by country"),
  filter_region: z.string().optional().describe("Filter by region"),
  filter_city: z.string().optional().describe("Filter by city"),
  filter_device: z
    .string()
    .optional()
    .describe("Filter by device type: desktop, mobile, tablet"),
  filter_browser: z.string().optional().describe("Filter by browser name"),
  filter_os: z.string().optional().describe("Filter by operating system"),
  filter_referrer: z.string().optional().describe("Filter by referrer domain"),
  filter_ref: z.string().optional().describe("Filter by ref URL parameter"),
  filter_source: z
    .string()
    .optional()
    .describe("Filter by source URL parameter"),
  filter_via: z.string().optional().describe("Filter by via URL parameter"),
  filter_utm_source: z.string().optional().describe("Filter by UTM source"),
  filter_utm_medium: z.string().optional().describe("Filter by UTM medium"),
  filter_utm_campaign: z.string().optional().describe("Filter by UTM campaign"),
  filter_utm_term: z.string().optional().describe("Filter by UTM term"),
  filter_utm_content: z.string().optional().describe("Filter by UTM content"),
  filter_page: z.string().optional().describe("Filter by page path"),
  filter_hostname: z.string().optional().describe("Filter by hostname"),
  filter_entry_page: z
    .string()
    .optional()
    .describe("Filter by entry/landing page"),
  filter_channel: z.string().optional().describe("Filter by marketing channel"),
  filter_goal: z.string().optional().describe("Filter by goal name"),
};

const queryFields = {
  ...websiteSelectorFields,
  ...dateRangeFields,
  ...paginationFields,
  ...filterFields,
};

const resultSchema = (description: string) => ({
  result: z.unknown().describe(description),
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

const additiveWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

const destructiveAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};

const toolResult = (data: unknown) => {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: { result: data },
  };
};

const toolError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
};

const cleanParams = (
  params: Record<string, unknown>,
): Record<string, unknown> => {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

const createMcpServer = (apiClient?: RestClient): McpServer => {
  const client = apiClient ?? api;
  const server = new McpServer({
    name: "flowsery",
    version: "1.0.0",
  });

  server.registerTool(
    "list_websites",
    {
      title: "List Websites",
      description:
        "List websites accessible by the current API token. Workspace tokens return every website in the workspace; website keys return only their website. Call this first when using a workspace token.",
      inputSchema: {},
      outputSchema: resultSchema(
        "List of websites the token can access, with identifiers and domains for use in other tools.",
      ),
      annotations: readOnlyAnnotations,
    },
    async () => {
      try {
        const data = await client.get("/websites");
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_metadata",
    {
      title: "Get Website Settings",
      description:
        "Get website configuration — domain, timezone, currency, KPI goal, and color scheme. With a workspace token, pass websiteId or domain; without one, this returns the website list.",
      inputSchema: websiteSelectorFields,
      outputSchema: resultSchema(
        "Website configuration including domain, timezone, currency, KPI goal, and color scheme.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/metadata", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_overview",
    {
      title: "Get Traffic Overview",
      description:
        "Get aggregated site metrics: visitors, sessions, bounce rate, average session duration, revenue, revenue per visitor, and conversion rate. Supports date range and all filters. Omit dates for all-time data.",
      inputSchema: {
        ...queryFields,
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated metrics to include: visitors, sessions, bounce_rate, avg_session_duration, currency, revenue, revenue_per_visitor, conversion_rate. Omit for all.",
          ),
      },
      outputSchema: resultSchema(
        "Aggregated metrics such as visitors, sessions, bounce rate, average session duration, revenue, revenue per visitor, and conversion rate.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/overview", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_timeseries",
    {
      title: "Get Analytics Time Series",
      description:
        "Get time series analytics data grouped by hour, day, week, or month. Returns timestamped data points with totals. Use for trend analysis and charting.",
      inputSchema: {
        ...queryFields,
        interval: TimeInterval.optional().describe(
          "Aggregation interval: hour, day, week, month (default: day)",
        ),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated metrics: visitors, sessions, revenue, conversion_rate, name",
          ),
      },
      outputSchema: resultSchema(
        "Timestamped data points for the chosen interval with the requested metrics and totals.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/timeseries", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_realtime",
    {
      title: "Get Active Visitor Count",
      description:
        "Get the number of currently active visitors on the site (active within the last 5 minutes).",
      inputSchema: websiteSelectorFields,
      outputSchema: resultSchema(
        "Count of visitors active on the site within the last 5 minutes.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/realtime", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_realtime_map",
    {
      title: "Get Live Visitor Map",
      description:
        "Get currently active visitors with geographic location data for map visualization.",
      inputSchema: websiteSelectorFields,
      outputSchema: resultSchema(
        "Currently active visitors with their geographic locations.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/realtime/map", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_pages",
    {
      title: "Get Top Pages",
      description:
        "Get top pages ranked by visitor count. Shows which pages get the most traffic.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Pages ranked by visitor count for the selected range and filters.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/pages", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_referrers",
    {
      title: "Get Top Referrers",
      description:
        "Get traffic sources — which websites and domains are sending visitors.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Referrer domains with visitor counts for the selected range and filters.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/referrers", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_countries",
    {
      title: "Get Visitors by Country",
      description: "Get visitor breakdown by country.",
      inputSchema: queryFields,
      outputSchema: resultSchema("Countries with visitor counts."),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/countries", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_regions",
    {
      title: "Get Visitors by Region",
      description: "Get visitor breakdown by region/state.",
      inputSchema: queryFields,
      outputSchema: resultSchema("Regions/states with visitor counts."),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/regions", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_cities",
    {
      title: "Get Visitors by City",
      description: "Get visitor breakdown by city.",
      inputSchema: queryFields,
      outputSchema: resultSchema("Cities with visitor counts."),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/cities", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_devices",
    {
      title: "Get Visitors by Device",
      description:
        "Get device type breakdown — desktop vs mobile vs tablet split.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Device types (desktop, mobile, tablet) with visitor counts.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/devices", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_browsers",
    {
      title: "Get Visitors by Browser",
      description:
        "Get browser distribution — Chrome, Safari, Firefox, Edge, etc.",
      inputSchema: queryFields,
      outputSchema: resultSchema("Browsers with visitor counts."),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/browsers", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_operating_systems",
    {
      title: "Get Visitors by Operating System",
      description:
        "Get operating system distribution — Mac OS, Windows, iOS, Android, Linux, etc.",
      inputSchema: queryFields,
      outputSchema: resultSchema("Operating systems with visitor counts."),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get(
          "/operating-systems",
          cleanParams(params),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_campaigns",
    {
      title: "Get Campaign Performance",
      description:
        "Get UTM campaign performance — which campaigns drive the most traffic.",
      inputSchema: queryFields,
      outputSchema: resultSchema("UTM campaigns with visitor counts."),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/campaigns", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_hostnames",
    {
      title: "Get Traffic by Hostname",
      description: "Get traffic breakdown by hostname/domain.",
      inputSchema: queryFields,
      outputSchema: resultSchema("Hostnames with visitor counts."),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/hostnames", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_channels",
    {
      title: "Get Traffic by Channel",
      description:
        "Get marketing channel breakdown — Organic Search, Paid Search, Social, Email, Direct, Referral, Affiliate, etc. GA4-aligned classification.",
      inputSchema: queryFields,
      outputSchema: resultSchema("Marketing channels with visitor counts."),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/channels", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_goals",
    {
      title: "Get Goal Completions",
      description:
        "Get goal/custom event completion stats within a date range.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Goals with completion stats for the selected date range.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/goals", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_breakdown",
    {
      title: "Get Breakdown by Dimension",
      description:
        "Generic breakdown by any dimension. Use this for dimensions that don't have a dedicated endpoint (e.g. entry_page, browser_version, os_version, utm_source, utm_medium, utm_term, utm_content, ref, source, all_params).",
      inputSchema: {
        ...queryFields,
        dimension: BreakdownDimension.describe(
          "Dimension to break down by: device, page, entry_page, exit_link, hostname, referrer, channel, campaign, goal, country, region, city, browser, browser_version, os, os_version, utm_source, utm_medium, utm_campaign, utm_term, utm_content, ref, source, all_params",
        ),
      },
      outputSchema: resultSchema(
        "Values of the requested dimension with visitor counts.",
      ),
      annotations: readOnlyAnnotations,
    },
    async ({ dimension, ...params }) => {
      try {
        const data = await client.get(
          "/breakdown",
          cleanParams({ dimension, ...params }),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_visitor",
    {
      title: "Get Visitor Profile",
      description:
        "Get full visitor profile — identity (geo, device, browser, OS), traffic source, activity (visits, pages, goals), revenue (total, customer flag, time to first conversion), identified profile (userId, name, email), and a merged activity timeline. The visitor ID comes from the _fs_vid browser cookie.",
      inputSchema: {
        ...websiteSelectorFields,
        visitorId: z.string().describe("Visitor ID (from _fs_vid cookie)"),
      },
      outputSchema: resultSchema(
        "Visitor profile with identity, traffic source, activity, revenue, identified profile fields, and an activity timeline.",
      ),
      annotations: readOnlyAnnotations,
    },
    async ({ visitorId, ...params }) => {
      try {
        const data = await client.get(
          `/visitors/${visitorId}`,
          cleanParams(params),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_issues",
    {
      title: "List Detected Issues",
      description:
        "List issues the AI found while analyzing session recordings — bugs, broken flows, and UX problems, deduplicated across sessions and ranked by severity. Each issue includes how many sessions hit it, first/last seen times, and steps to replicate. Also returns open/in-progress/resolved counts.",
      inputSchema: {
        ...websiteSelectorFields,
        status: z
          .enum(["open", "in_progress", "resolved", "suspended"])
          .optional()
          .describe("Filter by status. Default excludes suspended issues"),
        severity: z
          .enum(["low", "medium", "high", "critical"])
          .optional()
          .describe("Filter by severity"),
        search: z
          .string()
          .optional()
          .describe("Match against issue title and description"),
        sort: z
          .enum(["severity", "recency"])
          .optional()
          .describe("Order by severity (default) or recency (last seen)"),
        limit: z.number().optional().describe("Max results"),
        offset: z.number().optional().describe("Pagination offset"),
      },
      outputSchema: resultSchema(
        "Issues with severity, status, sessions affected, first/last seen, plus open/in-progress/resolved counts and pagination.",
      ),
      annotations: readOnlyAnnotations,
    },
    async (params) => {
      try {
        const data = await client.get("/issues", cleanParams(params));
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get Issue Detail",
      description:
        "Get full detail for one AI-detected issue: every occurrence the AI flagged with timestamps, the sessions behind it, steps to replicate, comments, and any linked external ticket (Linear/Jira).",
      inputSchema: {
        ...websiteSelectorFields,
        issueId: z.string().describe("Issue ID from list_issues"),
      },
      outputSchema: resultSchema(
        "The issue with occurrences, affected sessions, steps to replicate, comments, and external ticket link if any.",
      ),
      annotations: readOnlyAnnotations,
    },
    async ({ issueId, ...params }) => {
      try {
        const data = await client.get(
          `/issues/${issueId}`,
          cleanParams(params),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "update_issue_status",
    {
      title: "Update Issue Status",
      description:
        "Update an issue's status: open, in_progress, resolved, or suspended. Suspended issues disappear from the default list. Reversible — set any status back at any time.",
      inputSchema: {
        ...websiteSelectorFields,
        issueId: z.string().describe("Issue ID from list_issues"),
        status: z
          .enum(["open", "in_progress", "resolved", "suspended"])
          .describe("New status"),
      },
      outputSchema: resultSchema(
        "The updated issue with its new status.",
      ),
      annotations: additiveWriteAnnotations,
    },
    async ({ issueId, status, ...params }) => {
      try {
        const data = await client.patch(
          `/issues/${issueId}`,
          { status },
          cleanParams(params),
        );
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "track_goal",
    {
      title: "Track Goal Event",
      description:
        "Track a custom goal/event for a visitor. The visitor must have at least one recorded pageview. Goal names must be lowercase with only letters, numbers, underscores, and hyphens (max 64 chars).",
      inputSchema: {
        ...websiteSelectorFields,
        name: z
          .string()
          .describe(
            'Goal name — lowercase letters, numbers, underscores, hyphens only (max 64 chars). E.g. "newsletter_signup", "add-to-cart"',
          ),
        visitorUid: z
          .string()
          .optional()
          .describe("Visitor UID from the _fs_vid browser cookie"),
        metadata: z
          .record(z.string())
          .optional()
          .describe(
            "Up to 10 custom key-value pairs. Keys: lowercase, max 64 chars. Values: max 255 chars.",
          ),
      },
      outputSchema: resultSchema(
        "Confirmation of the recorded goal event.",
      ),
      annotations: additiveWriteAnnotations,
    },
    async (params) => {
      try {
        const data = await client.post("/goals", params);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_goals",
    {
      title: "Delete Goal Events",
      description:
        "Delete custom goal events by filter. At least one filter is required. WARNING: without a date range, matching records are deleted across the entire history.",
      inputSchema: {
        ...websiteSelectorFields,
        visitorId: z
          .string()
          .optional()
          .describe("Delete goals for this visitor"),
        name: z
          .string()
          .optional()
          .describe("Delete goals matching this event name"),
        startAt: z.string().optional().describe("ISO 8601 start timestamp"),
        endAt: z.string().optional().describe("ISO 8601 end timestamp"),
      },
      outputSchema: resultSchema(
        "Confirmation of the goal event deletion.",
      ),
      annotations: destructiveAnnotations,
    },
    async (params) => {
      try {
        const cleaned = cleanParams(params);
        const hasDeleteFilter = ["visitorId", "name", "startAt", "endAt"].some(
          (key) => cleaned[key] !== undefined,
        );
        if (!hasDeleteFilter) {
          throw new Error(
            "At least one filter required: visitorId, name, startAt, or endAt",
          );
        }
        const data = await client.delete("/goals", cleaned);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "track_payment",
    {
      title: "Track Payment",
      description:
        "Record a payment for revenue attribution. If you use Stripe, LemonSqueezy, or Polar, payments are tracked automatically — only use this for other providers.",
      inputSchema: {
        ...websiteSelectorFields,
        amount: z.number().describe("Payment amount (e.g. 29.99)"),
        currency: z.string().describe('Currency code (e.g. "USD", "EUR")'),
        transactionId: z
          .string()
          .describe("Unique transaction ID from your payment provider"),
        visitorUid: z
          .string()
          .optional()
          .describe(
            "Visitor UID from _fs_vid cookie — strongly recommended for accurate revenue attribution",
          ),
        sessionUid: z
          .string()
          .optional()
          .describe("Session ID for the current visitor session"),
        email: z.string().optional().describe("Customer email"),
        name: z.string().optional().describe("Customer name"),
        customerId: z
          .string()
          .optional()
          .describe("Customer ID from payment provider"),
        isRenewal: z
          .boolean()
          .optional()
          .describe("True for recurring/renewal payments"),
        isRefund: z.boolean().optional().describe("True for refunded payments"),
      },
      outputSchema: resultSchema(
        "Confirmation of the recorded payment.",
      ),
      annotations: additiveWriteAnnotations,
    },
    async (params) => {
      try {
        const data = await client.post("/payments", params);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "delete_payments",
    {
      title: "Delete Payments",
      description:
        "Delete payment records by filter. At least one filter is required. WARNING: without a date range, matching records are deleted across the entire history.",
      inputSchema: {
        ...websiteSelectorFields,
        transactionId: z
          .string()
          .optional()
          .describe("Delete the payment with this transaction ID"),
        visitorId: z
          .string()
          .optional()
          .describe("Delete all payments for this visitor"),
        startAt: z.string().optional().describe("ISO 8601 start timestamp"),
        endAt: z.string().optional().describe("ISO 8601 end timestamp"),
      },
      outputSchema: resultSchema(
        "Confirmation of the payment record deletion.",
      ),
      annotations: destructiveAnnotations,
    },
    async (params) => {
      try {
        const cleaned = cleanParams(params);
        const hasDeleteFilter = [
          "transactionId",
          "visitorId",
          "startAt",
          "endAt",
        ].some((key) => cleaned[key] !== undefined);
        if (!hasDeleteFilter) {
          throw new Error(
            "At least one filter required: transactionId, visitorId, startAt, or endAt",
          );
        }
        const data = await client.delete("/payments", cleaned);
        return toolResult(data);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
};

const SSE_ACCEPT = 'application/json, text/event-stream';

// The MCP SDK 406s unless Accept lists both types. `@hono/node-server` v1 rebuilds the
// request from rawHeaders, so headers.accept alone is not enough.
const forceStreamableAccept = (req: IncomingMessage) => {
  req.headers.accept = SSE_ACCEPT;

  const raw = req.rawHeaders;
  const index = raw.findIndex((entry, i) => i % 2 === 0 && entry.toLowerCase() === 'accept');

  if (index === -1) raw.push('Accept', SSE_ACCEPT);
  else raw[index + 1] = SSE_ACCEPT;
};

const main = async (): Promise<void> => {
  if (isHttpMode) {
    const httpServer = createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, mcp-session-id",
        });
        res.end();
        return;
      }

      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (req.url === "/.well-known/glama.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            $schema: "https://glama.ai/mcp/schemas/connector.json",
            maintainers: [{ email: "taras.shinkarenko@gmail.com" }],
          })
        );
        return;
      }

      if (req.url === "/.well-known/openai-apps-challenge") {
        const challenge = process.env.OPENAI_APPS_CHALLENGE;
        if (challenge) {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end(challenge);
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
        return;
      }

      if (handleProtectedResourceMetadata(oauthConfig, req, res)) {
        return;
      }

      if (req.url === "/mcp") {
        // Extract Bearer token from the incoming request
        const authHeader = req.headers.authorization ?? "";
        const bearerToken = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : authHeader;

        if (!bearerToken && oauthConfig.oauthRequired) {
          sendUnauthorized(oauthConfig, res, "Authentication required");
          return;
        }

        if (bearerToken && looksLikeJwt(bearerToken)) {
          const verdict = await verifyOauthJwt(oauthConfig, bearerToken);
          if (!verdict.valid) {
            sendUnauthorized(oauthConfig, res, verdict.error);
            return;
          }
        }

        const token = bearerToken || API_TOKEN;
        const reqApi = new RestClient(API_BASE_URL, token);

        const wantsSse = (req.headers.accept ?? '').includes('text/event-stream');
        if (!wantsSse) forceStreamableAccept(req);

        // Stateless mode requires a fresh transport per request
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: !wantsSse,
        });
        const reqServer = createMcpServer(reqApi);
        await reqServer.connect(transport);
        try {
          await transport.handleRequest(req, res);
        } catch (err) {
          console.error("MCP handleRequest error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: String(err) }));
          }
        }
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(HTTP_PORT, () => {
      console.error(
        `Flowsery Analytics MCP server (HTTP) listening on port ${HTTP_PORT}`,
      );
      console.error(`Connect with: https://your-domain/mcp`);
    });
  } else {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
