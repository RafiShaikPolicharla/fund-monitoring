import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import TierBadge from "@/components/TierBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, categoryLabel } from "@/lib/format";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { GovernanceTrail } from "@/components/GovernanceTrail";
import { GuardrailSteps, GuardrailStep } from "@/components/GuardrailSteps";
import { buildEventGuardrailSteps, runStepSequence } from "@/lib/guardrailSequences";
import { ChatPanel, ChatToggleButton } from "@/components/ChatPanel";
import { cn } from "@/lib/utils";
import { fundMonitoringAgentflow } from "@/services/fundMonitoringAgentflow";

type Fund = {
  id: string;
  ticker: string | null;
  name: string;
  pilot: boolean | null;
};

type EventRow = {
  id: string;
  fund_id: string | null;
  event_date: string;
  headline: string;
  raw_summary: string | null;
  source_publisher: string | null;
  category: string;
};

type IrAction = {
  event_id: string | null;
  action_taken: string;
  action_date: string | null;
  outcome: string | null;
};

type Alert = {
  category: string;
  tier: number;
  classification_reason: string;
  ir_summary: string;
  ir_action: string;
  advisor_message: string;
  time_pressure: string;
  confidence: number;
};

type CardState = {
  status: "idle" | "processing" | "done" | "error";
  steps: GuardrailStep[];
  hasWarning: boolean;
  alert?: Alert;
  prompts?: { system: string; user: string };
  rawResponse?: unknown;
  latency?: number;
  error?: string;
  expanded: boolean;
};

const ALL_PILOT = "__all_pilot__";

const LOOKBACK_OPTIONS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "6 months", days: 183 },
  { label: "12 months", days: 365 },
];

export default function Simulate() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [selectedFund, setSelectedFund] = useState<string>(ALL_PILOT);
  const [lookbackDays, setLookbackDays] = useState<number>(365);

  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [irActions, setIrActions] = useState<Record<string, IrAction>>({});
  const [eventAlertIds, setEventAlertIds] = useState<Record<string, string>>({});
  const [searchedFundLabel, setSearchedFundLabel] = useState<string>("");
  const [searchedWindowLabel, setSearchedWindowLabel] = useState<string>("");
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [runningAll, setRunningAll] = useState(false);

  const [systemPromptOpen, setSystemPromptOpen] = useState(false);
  const [eventPromptOpen, setEventPromptOpen] = useState<string | null>(null);
  const [rawResponseOpen, setRawResponseOpen] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // Load funds
  useEffect(() => {
    (async () => {
      try {
        const agentFunds = await fundMonitoringAgentflow.getFundUniverse();
        if (agentFunds.length > 0) {
          setFunds(agentFunds.map((fund) => ({
            id: fund.id,
            ticker: fund.ticker,
            name: fund.name,
            pilot: fund.pilot,
          })));
          return;
        }
      } catch {
        // Fall back to Supabase fixture data below.
      }

      const { data } = await supabase
        .from("funds")
        .select("id, ticker, name, pilot")
        .eq("approved_list", true)
        .order("ticker");
      setFunds((data ?? []) as Fund[]);
    })();
  }, []);

  const pilotFunds = useMemo(() => funds.filter((f) => f.pilot), [funds]);
  const selectedSingleFund = useMemo(
    () => (selectedFund !== ALL_PILOT ? funds.find((f) => f.id === selectedFund) : undefined),
    [selectedFund, funds]
  );
  const isSelectedSinglePilot = !!selectedSingleFund?.pilot;

  const chatScopeContext = useMemo(() => {
    const fundLabel = selectedSingleFund
      ? { ticker: selectedSingleFund.ticker, name: selectedSingleFund.name }
      : { name: "all pilot funds" };
    const lookback = LOOKBACK_OPTIONS.find((o) => o.days === lookbackDays)?.label ?? "";
    const events_in_window = events.map((e) => ({
      event_date: e.event_date,
      headline: e.headline,
      category: e.category,
      source_publisher: e.source_publisher,
    }));
    const expandedCard = events.find((e) => cards[e.id]?.expanded && cards[e.id]?.alert);
    const expanded_event = expandedCard
      ? {
          headline: expandedCard.headline,
          raw_summary: expandedCard.raw_summary,
          event_date: expandedCard.event_date,
          source_publisher: expandedCard.source_publisher,
          alert: cards[expandedCard.id]?.alert,
          governance: {
            latency_ms: cards[expandedCard.id]?.latency,
            steps: cards[expandedCard.id]?.steps?.map((s) => ({
              label: s.label,
              status: s.status,
              detail: s.detail,
            })),
          },
          ir_action_taken: irActions[expandedCard.id] ?? null,
        }
      : null;
    return {
      selected_fund: fundLabel,
      lookback,
      events_in_window,
      expanded_event,
      prompts: expandedCard ? cards[expandedCard.id]?.prompts ?? null : null,
    };
  }, [selectedSingleFund, lookbackDays, events, cards, irActions]);


  const findEvents = async () => {
    setSearching(true);
    setSearched(false);
    setEvents([]);
    setCards({});
    setIrActions({});

    const lookbackOpt = LOOKBACK_OPTIONS.find((o) => o.days === lookbackDays)!;
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);
    const sinceStr = since.toISOString().split("T")[0];

    let fundIds: string[] = [];
    let label = "";
    if (selectedFund === ALL_PILOT) {
      fundIds = pilotFunds.map((f) => f.id);
      label = "all pilot funds";
    } else if (selectedSingleFund) {
      fundIds = [selectedSingleFund.id];
      label = `${selectedSingleFund.ticker} — ${selectedSingleFund.name}`;
    }

    let evList: EventRow[] = [];
    let agentAlerts: Record<string, Alert> = {};

    const loadMockEvents = async () => {
      const { data: evData } = await supabase
        .from("events")
        .select("id, fund_id, event_date, headline, raw_summary, source_publisher, category")
        .in("fund_id", fundIds)
        .gte("event_date", sinceStr)
        .order("event_date", { ascending: false });
      evList = (evData ?? []) as EventRow[];
      agentAlerts = {};
    };

    try {
      const queryFundLabel =
        selectedFund === ALL_PILOT
          ? "all pilot funds"
          : selectedSingleFund?.ticker || selectedSingleFund?.name || label;
      const agentResult = await fundMonitoringAgentflow.findEvents(queryFundLabel, lookbackDays);
      evList = agentResult.events as EventRow[];
      agentAlerts = agentResult.alerts as Record<string, Alert>;
      if (evList.length === 0) await loadMockEvents();
    } catch {
      await loadMockEvents();
    }

    setEvents(evList);

    if (evList.length && Object.keys(agentAlerts).length === 0) {
      const eventIds = evList.map((e) => e.id);
      const [{ data: actData }, { data: alertData }] = await Promise.all([
        supabase
          .from("ir_actions")
          .select("event_id, action_taken, action_date, outcome")
          .in("event_id", eventIds),
        supabase.from("alerts").select("id, event_id").in("event_id", eventIds),
      ]);
      const map: Record<string, IrAction> = {};
      ((actData ?? []) as IrAction[]).forEach((a) => {
        if (a.event_id) map[a.event_id] = a;
      });
      setIrActions(map);
      const aMap: Record<string, string> = {};
      ((alertData ?? []) as { id: string; event_id: string | null }[]).forEach((a) => {
        if (a.event_id) aMap[a.event_id] = a.id;
      });
      setEventAlertIds(aMap);
    }

    const initialCards: Record<string, CardState> = {};
    evList.forEach((e) => {
      initialCards[e.id] = agentAlerts[e.id]
        ? {
            status: "done",
            steps: [],
            hasWarning: false,
            alert: agentAlerts[e.id],
            rawResponse: agentAlerts[e.id],
            expanded: false,
          }
        : { status: "idle", steps: [], hasWarning: false, expanded: false };
    });
    setCards(initialCards);

    setSearchedFundLabel(label);
    setSearchedWindowLabel(lookbackOpt.label);
    setSearched(true);
    setSearching(false);
  };

  const runEvent = async (ev: EventRow) => {
    // Check publisher allowlist up front
    let inAllowlist = false;
    let publisherCategory: string | null = null;
    let publisherTier: number | null = null;
    if (ev.source_publisher) {
      const { data: pubs } = await supabase
        .from("approved_publishers")
        .select("name, category, trust_tier")
        .ilike("name", ev.source_publisher);
      if (pubs && pubs.length > 0) {
        inAllowlist = true;
        publisherCategory = (pubs[0] as any).category ?? null;
        publisherTier = (pubs[0] as any).trust_tier ?? null;
      }
    }

    const stepDefs = buildEventGuardrailSteps({
      sourcePublisher: ev.source_publisher,
      sourceInAllowlist: inAllowlist,
      publisherCategory,
      publisherTrustTier: publisherTier,
    });

    setCards((prev) => ({
      ...prev,
      [ev.id]: {
        ...prev[ev.id],
        status: "processing",
        steps: [],
        hasWarning: !inAllowlist,
        error: undefined,
        expanded: true,
      },
    }));

    let captured: any = null;
    let claudeLatency = 0;
    let claudeData: any = null;

    try {
      await runStepSequence(stepDefs, {
        setSteps: (steps) =>
          setCards((prev) => ({
            ...prev,
            [ev.id]: { ...prev[ev.id], steps },
          })),
        claudeRunner: async () => {
          const t0 = performance.now();
          const { data, error } = await supabase.functions.invoke("simulate-event", {
            body: {
              fund_id: ev.fund_id,
              headline: ev.headline,
              raw_summary: ev.raw_summary ?? "",
              event_date: ev.event_date,
            },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          claudeLatency = Math.round(performance.now() - t0);
          claudeData = data;
          captured = data;
          return { latency: claudeLatency };
        },
      });

      setCards((prev) => ({
        ...prev,
        [ev.id]: {
          ...prev[ev.id],
          status: "done",
          alert: claudeData.alert,
          prompts: claudeData.prompts,
          rawResponse: claudeData,
          latency: claudeLatency,
          expanded: true,
        },
      }));
    } catch (e: any) {
      setCards((prev) => ({
        ...prev,
        [ev.id]: {
          ...prev[ev.id],
          status: "error",
          error: e?.message || "Request failed.",
        },
      }));
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    for (const ev of events) {
      const cur = cards[ev.id];
      if (cur?.status === "done") continue;
      await runEvent(ev);
      await new Promise((r) => setTimeout(r, 400));
    }
    setRunningAll(false);
  };

  const toggleExpanded = (id: string) => {
    setCards((prev) => ({ ...prev, [id]: { ...prev[id], expanded: !prev[id].expanded } }));
  };

  return (
    <div>
      <TopBar title="Inspect events">
        <ChatToggleButton open={chatOpen} onClick={() => setChatOpen((o) => !o)} />
      </TopBar>
      <div className="px-8 py-8 max-w-[1280px]">
        <p className="text-sm text-muted-foreground -mt-2 mb-6">
          Pick a fund and a window. View pre-computed alerts, run any event through the system live,
          and inspect the prompt driving the model.
        </p>

        {/* Controls */}
        <div className="border border-border rounded bg-card p-5">
          <div className="flex flex-wrap items-end gap-6">
            {/* Fund */}
            <div className="flex-1 min-w-[260px]">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Fund</label>
              <select
                value={selectedFund}
                onChange={(e) => setSelectedFund(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                <option value={ALL_PILOT}>All pilot funds</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.ticker} — {f.name}
                  </option>
                ))}
              </select>
              {isSelectedSinglePilot && (
                <div className="mt-1.5">
                  <span className="inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 bg-primary/10 text-primary rounded-sm">
                    Pilot fund
                  </span>
                </div>
              )}
            </div>

            {/* Lookback */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">
                Lookback
              </label>
              <div className="inline-flex border border-border rounded overflow-hidden">
                {LOOKBACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    onClick={() => setLookbackDays(opt.days)}
                    className={cn(
                      "px-3 h-10 text-xs font-medium border-r border-border last:border-r-0 transition-colors",
                      lookbackDays === opt.days
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-foreground hover:bg-panel"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSystemPromptOpen(true)}
              className="text-xs text-primary hover:underline ml-auto h-10 self-end"
            >
              View system prompt
            </button>
          </div>

          <Button
            onClick={findEvents}
            disabled={searching}
            className="w-full mt-5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {searching ? "Searching…" : "Find events"}
          </Button>
        </div>

        {/* Results */}
        {searched && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm">
                Found <span className="font-semibold">{events.length}</span> material event
                {events.length === 1 ? "" : "s"} in the last {searchedWindowLabel} for{" "}
                <span className="font-semibold">{searchedFundLabel}</span>.
              </p>
              {events.length > 0 && (
                <Button
                  onClick={runAll}
                  disabled={runningAll}
                  variant="outline"
                  size="sm"
                  className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  {runningAll ? "Running all…" : "Run all"}
                </Button>
              )}
            </div>

            {events.length === 0 ? (
              <div className="border border-dashed border-border rounded p-10 text-center text-sm text-muted-foreground">
                No material events found in this window. Try a longer lookback or another fund.
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    state={cards[ev.id]}
                    irAction={irActions[ev.id]}
                    alertId={eventAlertIds[ev.id]}
                    onRun={() => runEvent(ev)}
                    onToggle={() => toggleExpanded(ev.id)}
                    onViewPrompt={() => setEventPromptOpen(ev.id)}
                    onViewRaw={() => setRawResponseOpen(ev.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* System prompt modal */}
      <Dialog open={systemPromptOpen} onOpenChange={setSystemPromptOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>System prompt — sent on every call.</DialogTitle>
          </DialogHeader>
          <PromptBlock label="System prompt" content={SYSTEM_PROMPT} />
        </DialogContent>
      </Dialog>

      {/* Per-event prompt modal */}
      <Dialog open={!!eventPromptOpen} onOpenChange={(o) => !o && setEventPromptOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prompts sent for this event</DialogTitle>
          </DialogHeader>
          {eventPromptOpen && cards[eventPromptOpen]?.prompts ? (
            <div className="space-y-4">
              <CollapsiblePrompt label="System prompt" content={cards[eventPromptOpen]!.prompts!.system} />
              <CollapsiblePrompt
                label="User prompt for this event"
                content={cards[eventPromptOpen]!.prompts!.user}
                defaultOpen
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Run this event first to capture the prompt.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Raw response modal */}
      <Dialog open={!!rawResponseOpen} onOpenChange={(o) => !o && setRawResponseOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Raw response from edge function</DialogTitle>
          </DialogHeader>
          {rawResponseOpen && cards[rawResponseOpen]?.rawResponse ? (
            <PromptBlock
              label="Raw JSON"
              content={JSON.stringify(cards[rawResponseOpen]!.rawResponse, null, 2)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Run this event first to capture the response.</p>
          )}
        </DialogContent>
      </Dialog>

      <ChatPanel
        scope="inspect_events"
        scopeContext={chatScopeContext}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
    </div>
  );
}

function EventCard({
  event,
  state,
  irAction,
  alertId,
  onRun,
  onToggle,
  onViewPrompt,
  onViewRaw,
}: {
  event: EventRow;
  state: CardState | undefined;
  irAction: IrAction | undefined;
  alertId?: string;
  onRun: () => void;
  onToggle: () => void;
  onViewPrompt: () => void;
  onViewRaw: () => void;
}) {
  const s: CardState = state ?? { status: "idle", steps: [], hasWarning: false, expanded: false };

  return (
    <div className="border border-border rounded bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {formatDate(event.event_date)}
            {event.source_publisher && <> · {event.source_publisher}</>}
          </div>
          <div className="text-sm font-medium mt-1 leading-snug">{event.headline}</div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <StatusPill state={s} />
          {s.status === "error" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onRun}
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              Retry
            </Button>
          ) : s.status === "done" ? (
            <Button size="sm" variant="outline" onClick={onToggle}>
              {s.expanded ? "Collapse" : "Expand"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onRun}
              disabled={s.status === "processing"}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Run
            </Button>
          )}
        </div>
      </div>

      {/* Stepwise governance progress */}
      {(s.status === "processing" || (s.status === "done" && s.hasWarning)) &&
        s.steps.length > 0 && (
          <div className="px-5 pb-4 -mt-1">
            <div className="border-t border-border pt-3">
              <GuardrailSteps steps={s.steps} />
              {s.status === "done" && s.hasWarning && (
                <div
                  className="mt-2 text-[11px] px-3 py-2 rounded border"
                  style={{ background: "hsl(38 92% 95%)", borderColor: "hsl(38 60% 75%)", color: "hsl(38 60% 25%)" }}
                >
                  This alert passed model classification but is held for human verification because one or more guardrail checks flagged it.
                </div>
              )}
            </div>
          </div>
        )}

      {/* Error */}
      {s.status === "error" && s.error && (
        <div className="px-5 pb-4 -mt-1 text-xs text-destructive border-t border-border pt-3">
          {s.error}
        </div>
      )}

      {/* Expanded result */}
      {s.status === "done" && s.alert && s.expanded && (
        <div className="border-t border-border">
          <div className="px-5 py-4 flex items-center gap-3 bg-panel/40">
            <TierBadge tier={s.alert.tier} size="lg" />
            <span className="text-xs px-2 py-0.5 bg-muted rounded-sm uppercase tracking-wider">
              {categoryLabel(s.alert.category)}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">{s.alert.time_pressure}</span>
          </div>
          <div className="p-5 space-y-5">
            <Section title="What happened">{event.raw_summary || "—"}</Section>
            <Section title="System alert — summary">{s.alert.ir_summary}</Section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Section title="Classification reason">{s.alert.classification_reason}</Section>
              <div className="text-xs text-muted-foreground">
                Confidence {s.alert.confidence?.toFixed?.(2) ?? "—"} · {s.alert.time_pressure}
              </div>
            </div>
            <Section title="Recommended action">{s.alert.ir_action}</Section>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Advisor message
              </div>
              <div
                className="bg-panel pl-4 py-3 pr-3 text-sm leading-relaxed"
                style={{ borderLeft: "3px solid #007A4E" }}
              >
                {s.alert.advisor_message}
              </div>
            </div>

            {irAction && (
              <div className="border-t border-border pt-4">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  What actually happened
                </div>
                <div className="text-xs text-muted-foreground">
                  {irAction.action_date && <>{formatDate(irAction.action_date)} · </>}
                  {irAction.action_taken}
                  {irAction.outcome && <> — {irAction.outcome}</>}
                </div>
              </div>
            )}

            {alertId && (
              <GovernanceTrail alertId={alertId} sourcePublisher={event.source_publisher} />
            )}
          </div>
          <div className="px-5 py-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Generated by Claude Sonnet 4.6
              {s.latency != null && <> · {s.latency}ms</>}
            </span>
            <span className="flex items-center gap-4">
              <button onClick={onViewPrompt} className="text-primary hover:underline">
                View prompt
              </button>
              <button onClick={onViewRaw} className="text-primary hover:underline">
                View raw response
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ state }: { state: CardState }) {
  if (state.status === "idle") {
    return (
      <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-muted text-muted-foreground">
        Queued
      </span>
    );
  }
  if (state.status === "processing") {
    return (
      <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-primary/10 text-primary inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        Processing…
      </span>
    );
  }
  if (state.status === "error") {
    return (
      <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-destructive/10 text-destructive">
        Error — retry
      </span>
    );
  }
  return state.alert ? <TierBadge tier={state.alert.tier} /> : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
        {title}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function PromptBlock({ label, content }: { label: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <button onClick={copy} className="text-xs text-primary hover:underline">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap p-4 rounded border border-border max-h-[60vh] overflow-auto"
        style={{ background: "#F5F7F6" }}
      >
        {content}
      </pre>
    </div>
  );
}

function CollapsiblePrompt({
  label,
  content,
  defaultOpen = false,
}: {
  label: string;
  content: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 flex items-center justify-between text-left text-xs font-semibold uppercase tracking-wider"
      >
        {label}
        <span className="text-muted-foreground">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="p-3 border-t border-border">
          <PromptBlock label={label} content={content} />
        </div>
      )}
    </div>
  );
}
