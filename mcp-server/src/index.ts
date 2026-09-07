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
      "Website ID from list_websites. Required with a workspace token unless domain is given; ignored with a website key.",
    ),
  domain: z
    .string()
    .optional()
    .describe(
      'Website domain from list_websites (e.g. "example.com"). Alternative to websiteId with a workspace token.',
    ),
};

const dateRangeFields = {
  startAt: z
    .string()
    .optional()
    .describe(
      'ISO 8601 start of the reporting window, date or datetime (e.g. "2026-01-01" or "2026-01-01T00:00:00Z"). Defaults to 30 days ago.',
    ),
  endAt: z
    .string()
    .optional()
    .describe(
      'ISO 8601 end of the reporting window (e.g. "2026-01-31"). Defaults to now.',
    ),
  timezone: z
    .string()
    .optional()
    .describe(
      'IANA timezone used to bound and bucket the window (e.g. "America/New_York"). Defaults to the website timezone from get_metadata.',
    ),
};

const paginationFields = {
  limit: z
    .number()
    .optional()
    .describe("Max rows to return (1-1000, default 100)."),
  offset: z
    .number()
    .optional()
    .describe(
      "Rows to skip for pagination (default 0). Compare offset + limit against pagination.total in the response.",
    ),
};

const filterFields = {
  filter_country: z
    .string()
    .optional()
    .describe(
      'Filter by country name as returned by get_countries (e.g. "United States"). Every filter_* value accepts the same operators: "v" is, "!v" is not, "~v" contains, "!~v" does not contain, "a|b" any of. Filters combine with AND.',
    ),
  filter_region: z
    .string()
    .optional()
    .describe("Filter by region code as returned by get_regions (e.g. US-CA)"),
  filter_city: z
    .string()
    .optional()
    .describe("Filter by city name as returned by get_cities"),
  filter_device: z
    .string()
    .optional()
    .describe("Filter by device type: desktop, mobile, tablet"),
  filter_browser: z
    .string()
    .optional()
    .describe('Filter by browser name as returned by get_browsers (e.g. "Chrome")'),
  filter_os: z
    .string()
    .optional()
    .describe(
      'Filter by operating system name as returned by get_operating_systems (e.g. "iOS")',
    ),
  filter_referrer: z
    .string()
    .optional()
    .describe('Filter by referrer domain as returned by get_referrers (e.g. "google.com")'),
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
  filter_page: z
    .string()
    .optional()
    .describe('Filter by page path as returned by get_pages (e.g. "/pricing")'),
  filter_hostname: z
    .string()
    .optional()
    .describe('Filter by hostname as returned by get_hostnames (e.g. "app.example.com")'),
  filter_entry_page: z
    .string()
    .optional()
    .describe("Filter by entry/landing page"),
  filter_channel: z
    .string()
    .optional()
    .describe(
      'Filter by marketing channel as returned by get_channels (e.g. "Organic Search")',
    ),
  filter_goal: z
    .string()
    .optional()
    .describe(
      "Filter to visitors who completed this goal name (as returned by get_goals)",
    ),
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
        "List the websites the current API token can read, with id, domain, timezone, currency, and KPI goal per site. A workspace token (flow_ws_) returns every website in the workspace; a website key (flow_) returns only its own. Call this first with a workspace token: every other tool then needs websiteId or domain from this list, and omitting both fails with 'Website ID or domain is required'. Takes no parameters. Use get_metadata instead when you already know the website and only need its settings.",
      inputSchema: {},
      outputSchema: resultSchema(
        "Object with status and data: one entry per website with id, domain, timezone, currency, kpi, logo, and trackingId. Use id as websiteId or domain as domain in other tools.",
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
        "Get one website's settings: domain, timezone, currency, KPI goal name, logo, and color scheme. Read-only; nothing is changed. Call it after list_websites to learn the timezone and currency before running date-range reports, then pass that timezone to the report tools. With a workspace token pass websiteId or domain; with neither it returns the same website list as list_websites, so prefer list_websites for discovery. A website key needs no selector.",
      inputSchema: websiteSelectorFields,
      outputSchema: resultSchema(
        "Object with status and data: one entry with domain, timezone, currency, kpi, kpiColorScheme, and logo. Without a selector on a workspace token, the website list instead.",
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
        "Get headline totals for one website over a date range as a single row: visitors, sessions, bounce rate, average session duration, revenue, revenue per visitor, and conversion rate. Dates default to the last 30 days ending now; timezone defaults to the site setting. Every filter_* argument narrows the whole result, so filter_country plus filter_device answers 'mobile visitors from Germany' in one call. Use get_timeseries for the trend over time and a get_* breakdown tool for the split by page, source, or geography. Requires websiteId or domain with a workspace token.",
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
        "Object with status and data: a single row with visitors, sessions, bounce_rate, avg_session_duration, currency, revenue, revenue_per_visitor, and conversion_rate (a percentage) for the window.",
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
        "Get the same metrics as get_overview bucketed by hour, day, week, or month, plus totals across the whole window. Returns one point per bucket with a timestamp, the requested fields, and revenue split into new, renewal, and refund. Use this for trends and charts; use get_overview for one total and a get_* breakdown tool for a split by dimension rather than time. Dates default to the last 30 days and interval to day. Match interval to range: hourly buckets across a year return thousands of points. Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...queryFields,
        interval: TimeInterval.optional().describe(
          "Bucket size: hour, day, week, or month (default: day). Pick hour only for ranges of a few days.",
        ),
        fields: z
          .string()
          .optional()
          .describe(
            "Comma-separated metrics: visitors, sessions, revenue, conversion_rate, name",
          ),
      },
      outputSchema: resultSchema(
        "Object with interval, timezone, currency, data (one point per bucket with timestamp, name, the requested metrics, and revenueBreakdown of new, renewal, refund), totals across the window, and pagination.",
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
        "Count the visitors active on the site within the last 5 minutes. A point-in-time number with no history: it takes no date, filter, or pagination arguments. Use get_timeseries with interval hour for recent trends and get_realtime_map when you need where those visitors are. Returns data[0].visitors. Poll no more than once every 5 seconds. Requires websiteId or domain with a workspace token.",
      inputSchema: websiteSelectorFields,
      outputSchema: resultSchema(
        "Object with status and data: data[0].visitors is the count of visitors active in the last 5 minutes.",
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
        "Get the visitors active on the site in the last 5 minutes with their geographic location, for a live map view. Use get_realtime when only the count matters, and get_countries or get_cities for geography over a historical date range. Takes only the website selector: no dates, filters, or pagination. Poll no more than once every 5 seconds. Requires websiteId or domain with a workspace token.",
      inputSchema: websiteSelectorFields,
      outputSchema: resultSchema(
        "Object with status and data: up to 1000 active visitors, each with visitorId, country, countryCode, region, city, latitude, longitude, browser, os, deviceType, currentUrl, referrer, pageviews, totalRevenue, isCustomer, and name/email when identified.",
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
        "Get page paths ranked by visitors, descending, for a date range: which pages get the most traffic. Use get_breakdown with dimension entry_page for landing pages or exit_link for outbound clicks, and get_hostnames when the site serves several domains. Add filter_utm_campaign or filter_referrer to see where one source's traffic landed. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
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
        "Get referring domains ranked by visitors, descending: which external sites sent traffic in the date range. Use get_channels when you want traffic grouped into GA4-style channels (Direct, Organic Search, Paid Social) instead of individual domains, and get_campaigns or get_breakdown with dimension utm_source for traffic identified by UTM tags rather than referrer. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (referrer domain rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
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
      description: "Get visitors grouped by country, ranked by visitors descending, for a date range. Coarsest of the three geographic tools: use get_regions for states or provinces and get_cities for cities, and add filter_country to either to drill into one country. Use get_realtime_map for where visitors are right now instead of over a range. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (country rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
      ),
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
      description: "Get visitors grouped by region or state (ISO 3166-2 code such as US-CA), ranked by visitors descending, for a date range. Sits between get_countries (coarser) and get_cities (finer); combine with filter_country to list the regions of one country. Pass filter_region to other tools to scope them to one region. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (region rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
      ),
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
      description: "Get visitors grouped by city, ranked by visitors descending, for a date range. Finest geographic tool and the longest tail: pass filter_country or filter_region first so the top rows are meaningful, and raise limit above the default 100 (max 1000) when you need more. Use get_countries or get_regions for a coarser view. Rows carry value, visitors, revenue, and percentage with pagination.total. Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (city rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
      ),
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
        "Get visitors split by device type (desktop, mobile, tablet), ranked by visitors descending, for a date range. Use this for the mobile-versus-desktop question; use get_browsers or get_operating_systems for the software split. Pass filter_device to any other tool to restrict it to one device type instead. Three rows at most, so pagination rarely matters. Rows carry value, visitors, revenue, and percentage. Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (up to three rows, desktop, mobile, tablet, with value, visitors, revenue, percentage), and pagination.",
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
        "Get visitors grouped by browser name (Chrome, Safari, Firefox, Edge, and others), ranked by visitors descending, for a date range. Names only: use get_breakdown with dimension browser_version for versions, get_operating_systems for the OS split, and get_devices for desktop versus mobile. Pass filter_browser to other tools to scope them to one browser. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (browser rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
      ),
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
        "Get visitors grouped by operating system (Mac OS, Windows, iOS, Android, Linux, and others), ranked by visitors descending, for a date range. Names only: use get_breakdown with dimension os_version for versions, get_browsers for the browser split, and get_devices for desktop versus mobile. Pass filter_os to other tools to scope them to one OS. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (operating system rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
      ),
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
        "Get UTM campaigns (utm_campaign values) ranked by visitors descending for a date range. Only visits tagged with utm_campaign appear, so untagged traffic is absent; use get_referrers or get_channels for the full source picture. Use get_breakdown with dimension utm_source, utm_medium, utm_term, utm_content, or all_params for the other tracking parameters. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (utm_campaign rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
      ),
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
      description: "Get visitors grouped by hostname, ranked by visitors descending, for a date range. Useful when one website tracks several domains or subdomains (www, app, docs); a single-domain site returns one row. Use get_pages for paths within a host, and pass filter_hostname to any other tool to scope it to one host. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (hostname rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
      ),
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
        "Get visitors grouped into GA4-aligned marketing channels (Organic Search, Paid Search, Organic Social, Paid Social, Email, Display, Referral, Direct, Affiliate, Video, SMS, Audio), ranked by visitors descending, for a date range. Channels are classified from the referrer domain and utm_medium or utm_source. Use this first for the traffic mix, then get_referrers for the domains behind Referral and Organic Social, or get_campaigns for tagged campaigns. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (channel rows with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
      ),
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
        "Get every configured goal (custom events plus the auto-created payment and free_trial goals) with how many visitors completed it in the date range. Use this to compare conversions across goals; use get_overview for conversion_rate against the site's KPI goal, get_breakdown with dimension goal when you need filters and pagination on the same list, and get_visitor for one person's completions. Dates default to the last 30 days; filter_* narrows the visitors counted and limit/offset page the goal list. Goals are created by track_goal. Requires websiteId or domain with a workspace token.",
      inputSchema: queryFields,
      outputSchema: resultSchema(
        "Object with status, data (one entry per configured goal with its name and completion count for the window), and pagination.",
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
        "Group visitors by any one of 24 dimensions, ranked by visitors descending, for a date range. Generic form of the named get_* breakdown tools: use it for dimensions without one (entry_page, exit_link, browser_version, os_version, utm_source, utm_medium, utm_term, utm_content, ref, source, all_params); for page, referrer, country, region, city, device, browser, os, campaign, hostname, channel, or goal the dedicated tool returns the same rows. Combine dimension with filter_* to drill in: dimension page plus filter_utm_campaign shows where one campaign landed. Rows carry value, visitors, revenue, and percentage with pagination.total; limit defaults to 100 (max 1000). Dates default to the last 30 days; all filter_* arguments apply. Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...queryFields,
        dimension: BreakdownDimension.describe(
          "Dimension to group by. Without a dedicated tool: entry_page (landing page), exit_link (outbound click), browser_version, os_version, utm_source, utm_medium, utm_term, utm_content, ref, source, all_params (every tracking parameter at once). With one: device, page, hostname, referrer, channel, campaign (same as utm_campaign), goal, country, region, city, browser, os.",
        ),
      },
      outputSchema: resultSchema(
        "Object with status, data (rows of the requested dimension with value, visitors, revenue, percentage, ordered by visitors descending), and pagination {limit, offset, total}.",
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
        "Get one visitor's full profile: geo, device, and browser identity, acquisition source, activity (visit and pageview counts, visited pages, completed goals), revenue (total, customer flag, seconds to first conversion), the identified profile (userId, name, email), and a merged timeline of pageviews, goals, and payments, newest first. Contains personal data: call it only when asked about a specific visitor and surface the minimum needed. profile is null for anonymous visitors; each list is capped at the 100 most recent items. Use the aggregate get_* tools for questions about many visitors. visitorId comes from the _fs_vid cookie or the dashboard; an unknown id, or one from another website, fails with 'Visitor not found'. Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...websiteSelectorFields,
        visitorId: z
          .string()
          .describe(
            "Visitor ID, the _fs_vid cookie value set by the tracking script (also shown in the dashboard visitor view)",
          ),
      },
      outputSchema: resultSchema(
        "Object with status and data: visitorId, identity, source, sourceIconUrl, activity, revenue, profile (null when anonymous), and activityTimeline sorted newest first.",
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
        "List issues the AI found while analyzing session recordings: bugs, broken flows, and UX problems, deduplicated across sessions and ranked by severity (or by last seen with sort recency). Each row has title, severity, status, sessions affected, and first/last seen; the response also carries site-wide open, in_progress, and resolved counts plus pagination.total. Start here for 'what is broken', then call get_issue with an id for occurrences, steps to replicate, and comments. Suspended issues are hidden unless status is suspended, so an issue that vanished was probably suspended, not deleted. Limit defaults to 100 (max 1000). Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...websiteSelectorFields,
        status: z
          .enum(["open", "in_progress", "resolved", "suspended"])
          .optional()
          .describe(
            "Filter by status. Omit for open, in_progress, and resolved together; suspended issues only appear with status=suspended",
          ),
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
        limit: z
          .number()
          .optional()
          .describe("Max issues to return (1-1000, default 100)"),
        offset: z
          .number()
          .optional()
          .describe("Issues to skip for pagination (default 0)"),
      },
      outputSchema: resultSchema(
        "Object with status, data (issues with id, title, severity, status, sessionsAffected, firstSeenAt, lastSeenAt), counts {open, inProgress, resolved} for the whole site, and pagination {limit, offset, total}.",
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
        "Get full detail for one AI-detected issue: every occurrence with timestamps, the sessions behind it, steps to replicate, comments, and any linked Linear or Jira ticket. Get issueId from list_issues; use this only when you need the evidence behind one issue. An unknown id, or one from another website, fails with 'Issue not found'; on a free trial, issues beyond the first 10 fail with 'Upgrade to view this issue'. Session detail names pages, referrers, and geography, so surface only what answers the question. Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...websiteSelectorFields,
        issueId: z.string().describe("Issue ID from list_issues"),
      },
      outputSchema: resultSchema(
        "Object with status and data: the issue with its occurrences, affected sessions, steps to replicate, comments, and external ticket link if any.",
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
        "Set an issue's status to open, in_progress, resolved, or suspended and return the updated issue. Only the status changes; title, severity, occurrences, and comments stay, and any status can be set again later, so this is reversible. Confirm which state the user means before calling: resolved asserts the bug is fixed, suspended hides a known non-problem from the default list_issues result. Not a delete: issues cannot be removed through this server. Get issueId from list_issues; an unknown id fails with 'Issue not found'. Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...websiteSelectorFields,
        issueId: z.string().describe("Issue ID from list_issues"),
        status: z
          .enum(["open", "in_progress", "resolved", "suspended"])
          .describe(
            "New status. resolved asserts the bug is fixed; suspended hides a known non-problem from default listings; open and in_progress keep it visible",
          ),
      },
      outputSchema: resultSchema(
        "Object with status and data: the full issue detail after the change, with the new status.",
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
        "Record one completion of a custom goal. The goal is created on first use, so no setup call is needed; names are lowercase letters, digits, underscores, and hyphens, max 64 chars. Pass visitorUid (the _fs_vid cookie value of a visitor the tracking script has already seen) so the completion attaches to that visitor's sessions and source; omit it for an anonymous completion. Each call appends a completion, so repeating it counts the goal twice. Use track_payment for revenue, which records a payment goal on its own. Undo with delete_goals. Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...websiteSelectorFields,
        name: z
          .string()
          .describe(
            'Goal name: lowercase letters, numbers, underscores, hyphens only (max 64 chars). E.g. "newsletter_signup", "add-to-cart"',
          ),
        visitorUid: z
          .string()
          .optional()
          .describe(
            "Visitor UID from the _fs_vid browser cookie of a visitor the tracking script has seen. Omit to record an anonymous completion.",
          ),
        metadata: z
          .record(z.string())
          .optional()
          .describe(
            "Up to 10 custom key-value pairs. Keys: lowercase, max 64 chars. Values: max 255 chars.",
          ),
      },
      outputSchema: resultSchema(
        "Object with status and data: a confirmation message. The completion itself is written asynchronously and appears in get_goals shortly after.",
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
        "Permanently delete recorded goal completions matching every filter given (filters combine with AND). At least one of visitorId, name, startAt, or endAt is required or the call fails before reaching the API; startAt and endAt are independent, so one bound alone is allowed. Without a date range, matches are deleted across the whole history. Returns the number of rows deleted. Cannot be undone: restate website, filters, and range and get explicit confirmation first. Deletes completions only; the goal definition stays and get_goals still lists it. Use delete_payments for revenue records and update_issue_status for issues. Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...websiteSelectorFields,
        visitorId: z
          .string()
          .optional()
          .describe(
            "Delete completions of this visitor (the id get_visitor takes). Combined with the other filters using AND.",
          ),
        name: z
          .string()
          .optional()
          .describe("Delete completions of this goal name (as listed by get_goals)"),
        startAt: z
          .string()
          .optional()
          .describe(
            'ISO 8601 start of the deletion window, inclusive (e.g. "2026-01-01T00:00:00Z"). May be used without endAt.',
          ),
        endAt: z
          .string()
          .optional()
          .describe(
            'ISO 8601 end of the deletion window, inclusive (e.g. "2026-01-31T23:59:59Z"). May be used without startAt.',
          ),
      },
      outputSchema: resultSchema(
        "Object with status and data: deleted (number of completions removed) and a confirmation message.",
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
        "Record a payment so revenue appears in get_overview, get_timeseries, and the visitor profile. Skip it when the site's provider (Stripe, LemonSqueezy, Polar, and other connected providers) is tracked automatically; use track_goal for conversions without revenue. transactionId must be unique: a repeated id is rejected, not deduplicated. A new payment also records a payment goal completion (free_trial when amount is 0); isRenewal skips that. isRefund with an existing transactionId marks that payment refunded by amount instead of adding a row. Attribution looks up a known visitor by visitorUid, customerId, or email; with no match the revenue is kept but its source shows as Unknown. Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...websiteSelectorFields,
        amount: z
          .number()
          .describe(
            "Payment amount in major currency units (e.g. 29.99). With isRefund, the amount refunded. 0 records a free_trial goal instead of a payment goal.",
          ),
        currency: z.string().describe('Currency code (e.g. "USD", "EUR")'),
        transactionId: z
          .string()
          .describe(
            "Unique transaction ID from your payment provider. Must not repeat across payments; reuse it only with isRefund to mark that payment refunded.",
          ),
        visitorUid: z
          .string()
          .optional()
          .describe(
            "Visitor UID from the _fs_vid cookie. Strongly recommended: without it (or customerId/email matching a known visitor) the payment is attributed to Unknown",
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
          .describe(
            "Customer ID from the payment provider. Also used to find the visitor when visitorUid is absent.",
          ),
        isRenewal: z
          .boolean()
          .optional()
          .describe(
            "True for recurring/renewal charges. Renewals are counted in revenue but do not record the automatic payment goal.",
          ),
        isRefund: z
          .boolean()
          .optional()
          .describe(
            "True to record a refund. With an existing transactionId, marks that payment refunded by amount instead of creating a new record.",
          ),
      },
      outputSchema: resultSchema(
        "Object with status and data: a confirmation message once the payment is stored.",
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
        "Permanently delete payment records matching every filter given (filters combine with AND): one transactionId, all payments of a visitorId, and/or a createdAt window. At least one of transactionId, visitorId, startAt, or endAt is required or the call fails before reaching the API; startAt and endAt are independent, so one bound alone is allowed. Without a date range, matches are deleted across the whole history. Returns the number of rows deleted. Cannot be undone and removes revenue from every report and visitor profile, so restate website, filters, and range and get explicit confirmation first. To reverse a charge while keeping history, use track_payment with isRefund instead. Requires websiteId or domain with a workspace token.",
      inputSchema: {
        ...websiteSelectorFields,
        transactionId: z
          .string()
          .optional()
          .describe(
            "Delete the single payment with this transaction ID. Combined with the other filters using AND.",
          ),
        visitorId: z
          .string()
          .optional()
          .describe("Delete all payments of this visitor (the id get_visitor takes)"),
        startAt: z
          .string()
          .optional()
          .describe(
            'ISO 8601 start of the deletion window, inclusive (e.g. "2026-01-01T00:00:00Z"). May be used without endAt.',
          ),
        endAt: z
          .string()
          .optional()
          .describe(
            'ISO 8601 end of the deletion window, inclusive (e.g. "2026-01-31T23:59:59Z"). May be used without startAt.',
          ),
      },
      outputSchema: resultSchema(
        "Object with status and data: deleted (number of payment records removed) and a confirmation message.",
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
