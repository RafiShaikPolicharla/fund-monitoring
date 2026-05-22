import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import TierBadge from "@/components/TierBadge";
import { formatDate, formatAum, tierDot, categoryLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type FeedRow = {
  event_id: string;
  fund_id: string | null;
  ticker: string | null;
  fund_name: string | null;
  manager_name: string | null;
  asset_class: string | null;
  event_date: string | null;
  headline: string | null;
  source_publisher: string | null;
  raw_summary: string | null;
  category: string | null;
  subtype: string | null;
  tier: number | null;
  ir_summary: string | null;
  ir_action: string | null;
  advisor_message: string | null;
  classification_reason: string | null;
  time_pressure: string | null;
  confidence: number | null;
  pilot: boolean | null;
};

type Fund = {
  id: string;
  ticker: string | null;
  name: string;
  asset_class: string;
  category: string | null;
  aum_usd_billions: number | null;
  named_pms: string[] | null;
  manager_name?: string | null;
};

type IrAction = {
  event_id: string | null;
  action_taken: string;
  action_date: string | null;
  outcome: string | null;
};

export default function Retrospective() {
  const [stats, setStats] = useState({ funds: 0, pilot: 0, events: 0, t1: 0 });
  const [pilotFunds, setPilotFunds] = useState<Fund[]>([]);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [actions, setActions] = useState<Record<string, IrAction>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [fundsRes, pilotRes, eventsRes, t1Res, pilotFundsRes, feedRes, actionsRes] = await Promise.all([
        supabase.from("funds").select("id", { count: "exact", head: true }).eq("approved_list", true),
        supabase.from("funds").select("id", { count: "exact", head: true }).eq("pilot", true),
        supabase.from("events").select("id", { count: "exact", head: true }),
        supabase.from("alerts").select("id", { count: "exact", head: true }).eq("tier", 1),
        supabase
          .from("funds")
          .select("id, ticker, name, asset_class, category, aum_usd_billions, named_pms, managers(name)")
          .eq("pilot", true)
          .order("ticker"),
        supabase.from("v_event_feed").select("*").eq("pilot", true).order("event_date", { ascending: false }),
        supabase.from("ir_actions").select("event_id, action_taken, action_date, outcome"),
      ]);

      setStats({
        funds: fundsRes.count ?? 0,
        pilot: pilotRes.count ?? 0,
        events: eventsRes.count ?? 0,
        t1: t1Res.count ?? 0,
      });

      const pf: Fund[] = (pilotFundsRes.data ?? []).map((f: any) => ({
        ...f,
        manager_name: f.managers?.name ?? null,
      }));
      setPilotFunds(pf);
      setFeed((feedRes.data ?? []) as FeedRow[]);

      const map: Record<string, IrAction> = {};
      for (const a of actionsRes.data ?? []) if (a.event_id) map[a.event_id] = a as IrAction;
      setActions(map);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <TopBar title="Citizens Wealth — Market Research & Alerting" />
      <div className="border-b border-border bg-panel">
        <div className="px-8 py-2.5 flex gap-8 text-[12px]">
          <Stat label="Funds monitored" value={stats.funds} />
          <Stat label="Pilot funds" value={stats.pilot} />
          <Stat label="Events captured (last 12mo)" value={stats.events} />
          <Stat label="Tier-1 alerts" value={stats.t1} accent />
        </div>
      </div>

      <div className="px-8 py-8 max-w-[1280px]">
        <SectionHeader
          eyebrow="Pilot funds"
          title="Retrospective evidence"
          subtitle="What the system would have caught for pilot funds in the past 12 months."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          {pilotFunds.map((f) => (
            <FundCard key={f.id} fund={f} />
          ))}
        </div>

        <div id="timeline" className="mt-12">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Event timeline
          </h2>
          {loading ? (
            <div className="text-sm text-muted-foreground py-12 text-center">Loading events…</div>
          ) : feed.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center border border-dashed border-border rounded">
              No events found.
            </div>
          ) : (
            <div className="border border-border rounded bg-card">
              {feed.map((row, i) => (
                <EventRow
                  key={row.event_id}
                  row={row}
                  action={row.event_id ? actions[row.event_id] : undefined}
                  expanded={expanded === row.event_id}
                  onToggle={() => setExpanded(expanded === row.event_id ? null : row.event_id)}
                  isLast={i === feed.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn("font-semibold tabular-nums", accent ? "text-primary" : "text-foreground")}>{value}</span>
    </div>
  );
}

function SectionHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">{eyebrow}</div>
      <h2 className="text-2xl font-semibold tracking-tight mt-1">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{subtitle}</p>
    </div>
  );
}

function FundCard({ fund }: { fund: Fund }) {
  return (
    <div className="border border-border rounded bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums">{fund.ticker}</div>
          <div className="text-sm text-foreground mt-0.5">{fund.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {fund.manager_name ?? "—"} · {fund.asset_class}
          </div>
        </div>
        <a href="#timeline">
          <Button variant="outline" size="sm" className="text-xs">
            View events
          </Button>
        </a>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-border text-xs">
        <div>
          <div className="text-muted-foreground uppercase tracking-wider text-[10px]">AUM</div>
          <div className="font-medium mt-0.5 tabular-nums">{formatAum(fund.aum_usd_billions)}</div>
        </div>
        <div>
          <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Named PMs</div>
          <div className="font-medium mt-0.5">{(fund.named_pms ?? []).join(", ") || "—"}</div>
        </div>
      </div>
    </div>
  );
}

function EventRow({
  row,
  action,
  expanded,
  onToggle,
  isLast,
}: {
  row: FeedRow;
  action?: IrAction;
  expanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  const tier = row.tier ?? 3;
  return (
    <div className={cn(!isLast && "border-b border-border")}>
      <div className="grid grid-cols-[120px_1fr_auto] gap-6 items-start px-5 py-4">
        <div className="flex items-center gap-3 pt-0.5">
          <span className={cn("h-2.5 w-2.5 rounded-full border-2", tierDot(tier))} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {row.event_date ? formatDate(row.event_date) : "—"}
          </span>
        </div>
        <div>
          <div className="text-sm font-medium leading-snug">{row.headline}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
            <span>{row.source_publisher ?? "—"}</span>
            <span>·</span>
            <span className="px-1.5 py-0.5 bg-muted text-foreground rounded-sm text-[10px] uppercase tracking-wider">
              {categoryLabel(row.category ?? "")}
            </span>
            <span>·</span>
            <span className="font-medium text-foreground tabular-nums">{row.ticker}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <TierBadge tier={tier} />
          <Button variant="outline" size="sm" className="text-xs" onClick={onToggle}>
            {expanded ? "Hide" : "View alert"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="bg-panel border-t border-border px-5 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Block title="What happened">
            <p className="text-sm leading-relaxed">{row.raw_summary || "—"}</p>
          </Block>
          <Block title="System alert">
            <p className="text-sm leading-relaxed">{row.ir_summary || "—"}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Meta label="Reason" value={row.classification_reason} />
              <Meta label="Time pressure" value={row.time_pressure} />
              <Meta label="Confidence" value={row.confidence != null ? row.confidence.toFixed(2) : null} />
            </div>
          </Block>
          <Block title="Recommended action">
            <p className="text-sm leading-relaxed">{row.ir_action || "—"}</p>
          </Block>
          <Block title="Advisor message">
            <div className="border-l-2 border-primary bg-card pl-4 py-2 pr-3 text-sm leading-relaxed">
              {row.advisor_message || "—"}
            </div>
          </Block>
          {action && (
            <div className="lg:col-span-2 border-t border-border pt-4 mt-1">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                What actually happened
              </div>
              <div className="text-sm mt-2">
                <span className="font-medium">Action taken:</span> {action.action_taken}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {action.action_date ? formatDate(action.action_date) : "—"}
                {action.outcome ? ` · ${action.outcome}` : ""}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value ?? "—"}</span>
    </>
  );
}
