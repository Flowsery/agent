#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");

const API_BASE = "https://analytics.flowsery.com/analytics";
const CONFIG_DIR = path.join(os.homedir(), ".config", "flowsery");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const LOCAL_CONFIG = path.join(process.cwd(), ".flowsery", "config.json");

const getApiKey = () => {
  if (process.env.FLOWSERY_API_KEY) return process.env.FLOWSERY_API_KEY;
  if (fs.existsSync(LOCAL_CONFIG)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_CONFIG, "utf8")).apiKey;
    } catch {}
  }
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")).apiKey;
    } catch {}
  }
  return null;
};

const saveApiKey = (key, global = true) => {
  const dir = global ? CONFIG_DIR : path.join(process.cwd(), ".flowsery");
  const file = global ? CONFIG_FILE : LOCAL_CONFIG;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ apiKey: key }, null, 2));
};

const request = async (method, endpoint, body = null) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    error(
      "No API key found. Run: ./scripts/flowsery.js setup --key flow_xxxxx",
    );
    error("Get your API key at: https://flowsery.com/api-tokens");
    process.exit(1);
  }
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    error(`API error (${res.status}): ${JSON.stringify(data)}`);
    process.exit(1);
  }
  return data;
};

const output = (data) => {
  console.log(JSON.stringify(data, null, 2));
};

const error = (msg) => {
  console.error(`\x1b[31mError:\x1b[0m ${msg}`);
};

const info = (msg) => {
  console.error(`\x1b[36mInfo:\x1b[0m ${msg}`);
};

const parseArgs = (args) => {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = true;
      } else {
        parsed[key] = next;
        i++;
      }
    }
  }
  return parsed;
};

const buildQueryString = (parsed) => {
  const params = new URLSearchParams();
  if (parsed.startAt || parsed["start-at"])
    params.set("startAt", parsed.startAt || parsed["start-at"]);
  if (parsed.endAt || parsed["end-at"])
    params.set("endAt", parsed.endAt || parsed["end-at"]);
  if (parsed.timezone) params.set("timezone", parsed.timezone);
  if (parsed.limit) params.set("limit", parsed.limit);
  if (parsed.offset) params.set("offset", parsed.offset);
  if (parsed.fields) params.set("fields", parsed.fields);

  const filterKeys = [
    "filter_country",
    "filter_region",
    "filter_city",
    "filter_device",
    "filter_browser",
    "filter_os",
    "filter_referrer",
    "filter_ref",
    "filter_source",
    "filter_via",
    "filter_utm_source",
    "filter_utm_medium",
    "filter_utm_campaign",
    "filter_utm_term",
    "filter_utm_content",
    "filter_page",
    "filter_hostname",
    "filter_entry_page",
    "filter_channel",
    "filter_goal",
  ];
  for (const key of filterKeys) {
    const dashKey = key.replace(/_/g, "-");
    if (parsed[key]) params.set(key, parsed[key]);
    else if (parsed[dashKey]) params.set(key, parsed[dashKey]);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

const COMMANDS = {
  setup: async (args) => {
    const parsed = parseArgs(args);
    const key = parsed.key || parsed["api-key"];
    if (!key) {
      error("Usage: ./scripts/flowsery.js setup --key flow_xxxxx");
      error("Get your API key at: https://flowsery.com/api-tokens");
      process.exit(1);
    }
    const global = !parsed.local;
    saveApiKey(key, global);
    info(`API key saved ${global ? "globally" : "locally"}.`);
    output({ status: "configured", location: global ? "global" : "local" });
  },

  metadata: async () => {
    const data = await request("GET", "/api/v1/metadata");
    output(data);
  },

  overview: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/overview${qs}`);
    output(data);
  },

  timeseries: async (args) => {
    const parsed = parseArgs(args);
    const extra = new URLSearchParams();
    if (parsed.interval) extra.set("interval", parsed.interval);
    const qs = buildQueryString(parsed);
    const extraQs = extra.toString();
    const fullQs = [qs.replace("?", ""), extraQs].filter(Boolean).join("&");
    const data = await request(
      "GET",
      `/api/v1/timeseries${fullQs ? `?${fullQs}` : ""}`,
    );
    output(data);
  },

  realtime: async () => {
    const data = await request("GET", "/api/v1/realtime");
    output(data);
  },

  "realtime:map": async () => {
    const data = await request("GET", "/api/v1/realtime/map");
    output(data);
  },

  pages: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/pages${qs}`);
    output(data);
  },

  referrers: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/referrers${qs}`);
    output(data);
  },

  countries: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/countries${qs}`);
    output(data);
  },

  regions: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/regions${qs}`);
    output(data);
  },

  cities: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/cities${qs}`);
    output(data);
  },

  devices: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/devices${qs}`);
    output(data);
  },

  browsers: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/browsers${qs}`);
    output(data);
  },

  "operating-systems": async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/operating-systems${qs}`);
    output(data);
  },

  campaigns: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/campaigns${qs}`);
    output(data);
  },

  hostnames: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/hostnames${qs}`);
    output(data);
  },

  channels: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/channels${qs}`);
    output(data);
  },

  goals: async (args) => {
    const parsed = parseArgs(args);
    const qs = buildQueryString(parsed);
    const data = await request("GET", `/api/v1/goals${qs}`);
    output(data);
  },

  breakdown: async (args) => {
    const parsed = parseArgs(args);
    if (!parsed.dimension) {
      error(
        "Usage: ./scripts/flowsery.js breakdown --dimension <dim> [--startAt ...] [--limit ...]",
      );
      error(
        "Dimensions: device, page, entry_page, exit_link, hostname, referrer, channel, campaign, goal, country, region, city, browser, browser_version, os, os_version, utm_source, utm_medium, utm_campaign, utm_term, utm_content, ref, source, all_params",
      );
      process.exit(1);
    }
    const extra = new URLSearchParams();
    extra.set("dimension", parsed.dimension);
    const qs = buildQueryString(parsed);
    const extraQs = extra.toString();
    const fullQs = [qs.replace("?", ""), extraQs].filter(Boolean).join("&");
    const data = await request(
      "GET",
      `/api/v1/breakdown${fullQs ? `?${fullQs}` : ""}`,
    );
    output(data);
  },

  visitor: async (args) => {
    const parsed = parseArgs(args);
    if (!parsed.id) {
      error("Usage: ./scripts/flowsery.js visitor --id <visitor_id>");
      process.exit(1);
    }
    const data = await request("GET", `/api/v1/visitors/${parsed.id}`);
    output(data);
  },

  "goals:create": async (args) => {
    const parsed = parseArgs(args);
    if (!parsed.name) {
      error(
        'Usage: ./scripts/flowsery.js goals:create --name "goal_name" --visitor-uid <uid> [--metadata \'{"key":"val"}\']',
      );
      process.exit(1);
    }
    const body = { name: parsed.name };
    if (parsed["visitor-uid"] || parsed.visitorUid) {
      body.visitorUid = parsed["visitor-uid"] || parsed.visitorUid;
    }
    if (parsed.metadata) {
      try {
        body.metadata = JSON.parse(parsed.metadata);
      } catch {
        error("Invalid JSON in --metadata");
        process.exit(1);
      }
    }
    const data = await request("POST", "/api/v1/goals", body);
    output(data);
  },

  "goals:delete": async (args) => {
    const parsed = parseArgs(args);
    const params = new URLSearchParams();
    if (parsed["visitor-id"] || parsed.visitorId)
      params.set("visitorId", parsed["visitor-id"] || parsed.visitorId);
    if (parsed.name) params.set("name", parsed.name);
    if (parsed.startAt || parsed["start-at"])
      params.set("startAt", parsed.startAt || parsed["start-at"]);
    if (parsed.endAt || parsed["end-at"])
      params.set("endAt", parsed.endAt || parsed["end-at"]);
    const qs = params.toString();
    if (!qs) {
      error(
        "At least one filter required: --visitor-id, --name, --start-at, --end-at",
      );
      process.exit(1);
    }
    const data = await request("DELETE", `/api/v1/goals?${qs}`);
    output(data);
  },

  "payments:create": async (args) => {
    const parsed = parseArgs(args);
    if (
      !parsed.amount ||
      !parsed.currency ||
      !(parsed["transaction-id"] || parsed.transactionId)
    ) {
      error(
        'Usage: ./scripts/flowsery.js payments:create --amount 29.99 --currency USD --transaction-id pay_123 [--visitor-uid <uid>]',
      );
      process.exit(1);
    }
    const body = {
      amount: parseFloat(parsed.amount),
      currency: parsed.currency,
      transactionId: parsed["transaction-id"] || parsed.transactionId,
    };
    if (parsed["visitor-uid"] || parsed.visitorUid)
      body.visitorUid = parsed["visitor-uid"] || parsed.visitorUid;
    if (parsed.email) body.email = parsed.email;
    if (parsed.name) body.name = parsed.name;
    if (parsed["customer-id"] || parsed.customerId)
      body.customerId = parsed["customer-id"] || parsed.customerId;
    if (parsed.renewal) body.isRenewal = true;
    if (parsed.refund) body.isRefund = true;
    const data = await request("POST", "/api/v1/payments", body);
    output(data);
  },

  "payments:delete": async (args) => {
    const parsed = parseArgs(args);
    const params = new URLSearchParams();
    if (parsed["transaction-id"] || parsed.transactionId)
      params.set(
        "transactionId",
        parsed["transaction-id"] || parsed.transactionId,
      );
    if (parsed["visitor-id"] || parsed.visitorId)
      params.set("visitorId", parsed["visitor-id"] || parsed.visitorId);
    if (parsed.startAt || parsed["start-at"])
      params.set("startAt", parsed.startAt || parsed["start-at"]);
    if (parsed.endAt || parsed["end-at"])
      params.set("endAt", parsed.endAt || parsed["end-at"]);
    const qs = params.toString();
    if (!qs) {
      error(
        "At least one filter required: --transaction-id, --visitor-id, --start-at, --end-at",
      );
      process.exit(1);
    }
    const data = await request("DELETE", `/api/v1/payments?${qs}`);
    output(data);
  },

  help: async () => {
    output({
      name: "Flowsery Analytics Agent Skill",
      version: "1.0.0",
      commands: Object.keys(COMMANDS).filter((c) => c !== "help"),
      docs: "https://flowsery.com/docs/api-introduction",
      api_tokens: "https://flowsery.com/api-tokens",
    });
  },
};

const main = async () => {
  const command = process.argv[2] || "help";
  const args = process.argv.slice(3);

  if (!COMMANDS[command]) {
    error(`Unknown command: ${command}`);
    error(`Available: ${Object.keys(COMMANDS).join(", ")}`);
    process.exit(1);
  }

  try {
    await COMMANDS[command](args);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
};

main();
