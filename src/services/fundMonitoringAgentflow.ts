import { askAgentflow } from "./agentflow";

export type AgentAlert = {
  event_id?: string;
  event_name?: string;
  event_summary?: string;
  event_date?: string;
  ticker?: string;
  publisher?: string;
  fund_name?: string;
  manager_name?: string;
  category?: string;
  tier?: number | string;
  confidence_score?: number | string;
  classification_reason?: string;
  ir_summary?: string;
  ir_action?: string;
  advisor_message?: string;
  time_pressure?: string;
};

export type AgentFund = {
  id?: string;
  ticker?: string;
  name?: string;
  fund_name?: string;
  manager_name?: string;
  manager?: string;
  asset_class?: string;
  category?: string;
  aum_usd_billions?: number | string;
  aum?: number | string;
  named_pms?: string[] | string | null;
  pilot?: boolean | string | null;
};

export type AgentEvent = AgentAlert & {
  id?: string;
  headline?: string;
  raw_summary?: string;
  source_publisher?: string;
};

export type QueueRow = {
  alert_id: string;
  tier: number | null;
  status: string | null;
  ir_summary: string | null;
  ir_action: string | null;
  advisor_message: string | null;
  classification_reason: string | null;
  time_pressure: string | null;
  confidence: number | null;
  event_id: string | null;
  event_date: string | null;
  headline: string | null;
  category: string | null;
  subtype: string | null;
  source_publisher: string | null;
  raw_summary: string | null;
  fund_id: string | null;
  ticker: string | null;
  fund_name: string | null;
  asset_class: string | null;
  pilot: boolean | null;
  manager_name: string | null;
};

export type EventRow = {
  id: string;
  fund_id: string | null;
  event_date: string;
  headline: string;
  raw_summary: string | null;
  source_publisher: string | null;
  category: string;
};

export type Alert = {
  category: string;
  tier: number;
  classification_reason: string;
  ir_summary: string;
  ir_action: string;
  advisor_message: string;
  time_pressure: string;
  confidence: number;
};

export type FundRow = {
  id: string;
  ticker: string | null;
  name: string;
  asset_class: string;
  aum_usd_billions: number | null;
  named_pms: string[] | null;
  pilot: boolean | null;
  manager_name: string | null;
};

const ALERT_QUEUE_QUERY = import.meta.env.VITE_ALERT_QUEUE_QUERY || "Populate the alert queue";
const FUND_UNIVERSE_QUERY = import.meta.env.VITE_FUND_UNIVERSE_QUERY || "Get the list of all approved funds";

function normalizePythonish(raw: string): string {
  return raw
    .replace(/\bNone\b/g, "null")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
    .replace(/:\s*'([\s\S]*?)'(?=\s*[,}])/g, (_, value: string) => `: ${JSON.stringify(value)}`);
}

function tryParse(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue.
  }

  try {
    return JSON.parse(normalizePythonish(trimmed));
  } catch {
    return null;
  }
}

function parseNestedString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return tryParse(value) ?? value;
}

function decodeQuotedValue(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .trim();
}

function extractQuotedKeyLists(raw: string, keys: string[]): unknown[] {
  const rows: unknown[] = [];

  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`['"]${escapedKey}['"]\\s*:\\s*'((?:\\\\.|[^'\\\\])*)'`, "g");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(raw)) !== null) {
      const parsed = tryParse(decodeQuotedValue(match[1]));
      if (Array.isArray(parsed)) rows.push(...parsed);
      else if (parsed && typeof parsed === "object") rows.push(parsed);
    }
  }

  return rows;
}

function extractList(raw: string, keys: string[]): unknown[] {
  const directlyExtracted = extractQuotedKeyLists(raw, keys);
  if (directlyExtracted.length > 0) return directlyExtracted;

  const parsed = tryParse(raw);
  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  const collected: unknown[] = [];
  let emptyMatch: unknown[] | null = null;

  for (const candidate of candidates) {
    const value = parseNestedString(candidate);
    if (Array.isArray(value)) {
      if (value.length > 0) collected.push(...value);
      emptyMatch = value;
      continue;
    }
    if (!value || typeof value !== "object") continue;

    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const nested = parseNestedString(record[key]);
      if (Array.isArray(nested)) {
        if (nested.length > 0) collected.push(...nested);
        emptyMatch = nested;
      }
    }
  }

  if (collected.length > 0) return collected;

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      const nested = parseNestedString(value);
      if (Array.isArray(nested)) {
        if (nested.length > 0) collected.push(...nested);
        emptyMatch = nested;
      }
    }
  }

  if (collected.length > 0) return collected;
  return emptyMatch ?? [];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const n = Number.parseFloat(value.replace(/[$,%BMbmk\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toTier(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toConfidence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1 ? value / 100 : value;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return null;
    return n > 1 ? n / 100 : n;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (["true", "yes", "y", "pilot"].includes(lower)) return true;
    if (["false", "no", "n"].includes(lower)) return false;
  }
  return null;
}

function toNamedPms(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((part) => part.trim()).filter(Boolean);
  return null;
}

function normalizeCategory(value: unknown): string {
  return String(value ?? "manager").trim().toLowerCase();
}

function idSafe(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function toQueueRow(item: AgentAlert, index: number): QueueRow {
  const eventId = item.event_id || `agent_event_${index}`;
  const ticker = item.ticker ?? null;
  const fundName = item.fund_name ?? null;

  return {
    alert_id: `agent_alert_${eventId}`,
    tier: toTier(item.tier),
    status: "pending",
    ir_summary: item.ir_summary ?? null,
    ir_action: item.ir_action ?? null,
    advisor_message: item.advisor_message ?? null,
    classification_reason: item.classification_reason ?? null,
    time_pressure: item.time_pressure ?? null,
    confidence: toConfidence(item.confidence_score),
    event_id: eventId,
    event_date: item.event_date ?? null,
    headline: item.event_name ?? null,
    category: normalizeCategory(item.category),
    subtype: null,
    source_publisher: item.publisher ?? null,
    raw_summary: item.event_summary ?? null,
    fund_id: ticker ? `agent_fund_${idSafe(ticker)}` : null,
    ticker,
    fund_name: fundName,
    asset_class: null,
    pilot: true,
    manager_name: item.manager_name ?? null,
  };
}

export function toEventRow(item: AgentEvent, index: number): EventRow {
  const eventId = item.event_id || item.id || `agent_event_${index}`;
  const ticker = item.ticker ? idSafe(item.ticker) : index;

  return {
    id: eventId,
    fund_id: `agent_fund_${ticker}`,
    event_date: item.event_date || new Date().toISOString().slice(0, 10),
    headline: item.event_name || item.headline || "Fund event",
    raw_summary: item.event_summary || item.raw_summary || null,
    source_publisher: item.publisher || item.source_publisher || null,
    category: normalizeCategory(item.category),
  };
}

export function toAlert(item: AgentAlert): Alert {
  return {
    category: normalizeCategory(item.category),
    tier: toTier(item.tier) ?? 3,
    classification_reason: item.classification_reason ?? "Agentflow classified this event for review.",
    ir_summary: item.ir_summary ?? item.event_summary ?? "Agentflow alert generated.",
    ir_action: item.ir_action ?? "Review the event and determine the appropriate investment research action.",
    advisor_message: item.advisor_message ?? "No advisor message generated.",
    time_pressure: item.time_pressure ?? "Review timing not specified.",
    confidence: toConfidence(item.confidence_score) ?? 0,
  };
}

export function toFundRow(item: AgentFund, index: number): FundRow {
  const ticker = item.ticker ?? null;
  return {
    id: item.id || (ticker ? `agent_fund_${idSafe(ticker)}` : `agent_fund_${index}`),
    ticker,
    name: item.name || item.fund_name || "Approved fund",
    asset_class: item.asset_class || item.category || "—",
    aum_usd_billions: toNumber(item.aum_usd_billions ?? item.aum),
    named_pms: toNamedPms(item.named_pms),
    pilot: toBoolean(item.pilot),
    manager_name: item.manager_name || item.manager || null,
  };
}

export function buildInspectEventsQuery(fundLabel: string, lookbackDays: number): string {
  return `events of ${fundLabel} in the last ${lookbackDays} days`;
}

function mapInspectEventsFromText(text: string): { events: EventRow[]; alerts: Record<string, Alert> } {
  const list = extractList(text, ["alert_queue", "events", "event_list", "data"]) as AgentEvent[];
  const events = list.map(toEventRow);
  const alerts: Record<string, Alert> = {};
  list.forEach((item, index) => {
    const event = events[index];
    if (event) alerts[event.id] = toAlert(item);
  });
  return { events, alerts };
}

export const fundMonitoringAgentflow = {
  async getAlertQueue(): Promise<QueueRow[]> {
    const result = await askAgentflow(ALERT_QUEUE_QUERY);
    return extractList(result.text, ["alert_queue", "alerts", "data"]).map((item, index) =>
      toQueueRow(item as AgentAlert, index),
    );
  },

  async findEvents(fundLabel: string, lookbackDays: number): Promise<{ events: EventRow[]; alerts: Record<string, Alert> }> {
    const result = await askAgentflow(buildInspectEventsQuery(fundLabel, lookbackDays));
    return mapInspectEventsFromText(result.text);
  },

  async getFundUniverse(): Promise<FundRow[]> {
    const result = await askAgentflow(FUND_UNIVERSE_QUERY);
    return extractList(result.text, ["fund_universe", "approved_fund_universe", "approved_funds", "funds", "data"]).map((item, index) =>
      toFundRow(item as AgentFund, index),
    );
  },
};
