import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import TierBadge from "@/components/TierBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatDate, categoryLabel } from "@/lib/format";
import { GovernanceTrail } from "@/components/GovernanceTrail";
import { GuardrailSteps, GuardrailStep } from "@/components/GuardrailSteps";
import { buildBatchGuardrailSteps, runStepSequence } from "@/lib/guardrailSequences";
import { ChatPanel, ChatToggleButton } from "@/components/ChatPanel";
import { cn } from "@/lib/utils";
import { fundMonitoringAgentflow } from "@/services/fundMonitoringAgentflow";

type BatchRun = {
  id: string;
  started_at: string;
  completed_at: string | null;
  sources_scanned: number;
  candidate_events: number;
  alerts_produced: number;
  alerts_suppressed: number;
  tier1_count: number | null;
  tier2_count: number | null;
  tier3_count: number | null;
};

type QueueRow = {
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

type ActionedRow = {
  alert_id: string;
  tier: number | null;
  status: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  edited_advisor_message: string | null;
  rejection_reason: string | null;
  original_advisor_message: string | null;
  headline: string | null;
  event_date: string | null;
  ticker: string | null;
  fund_name: string | null;
};

const REVIEWER = "Demo User, Senior Analyst";

// Batch re-run stages now driven by buildBatchGuardrailSteps()

const REJECT_REASONS = [
  "Not material",
  "Duplicate of earlier alert",
  "Data error / misclassification",
  "Wrong fund attribution",
  "Other (specify)",
];

function buildAgentflowRun(queue: QueueRow[]): BatchRun {
  const now = new Date().toISOString();
  return {
    id: "agentflow_daily_run",
    started_at: now,
    completed_at: now,
    sources_scanned: new Set(queue.map((row) => row.source_publisher).filter(Boolean)).size,
    candidate_events: queue.length,
    alerts_produced: queue.length,
    alerts_suppressed: 0,
    tier1_count: queue.filter((row) => row.tier === 1).length,
    tier2_count: queue.filter((row) => row.tier === 2).length,
    tier3_count: queue.filter((row) => row.tier === 3).length,
  };
}

function toActionedRow(row: QueueRow, status: string, editedMessage?: string | null, rejectionReason?: string | null): ActionedRow {
  return {
    alert_id: row.alert_id,
    tier: row.tier,
    status,
    reviewer_name: REVIEWER,
    reviewed_at: new Date().toISOString(),
    edited_advisor_message: editedMessage ?? null,
    rejection_reason: rejectionReason ?? null,
    original_advisor_message: row.advisor_message,
    headline: row.headline,
    event_date: row.event_date,
    ticker: row.ticker,
    fund_name: row.fund_name,
  };
}

export default function DailyOperations() {
  const [latestRun, setLatestRun] = useState<BatchRun | null>(null);
  const [allRuns, setAllRuns] = useState<BatchRun[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [actioned, setActioned] = useState<ActionedRow[]>([]);
  const [agentflowMode, setAgentflowMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const [expandedQueue, setExpandedQueue] = useState<Record<string, boolean>>({});
  const [expandedActioned, setExpandedActioned] = useState<Record<string, boolean>>({});

  const [rerunning, setRerunning] = useState(false);
  const [rerunSteps, setRerunSteps] = useState<GuardrailStep[]>([]);
  const [chatOpen, setChatOpen] = useState(false);

  const [approveTarget, setApproveTarget] = useState<QueueRow | null>(null);
  const [editTarget, setEditTarget] = useState<QueueRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<QueueRow | null>(null);

  const [editText, setEditText] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectOther, setRejectOther] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    const [agentQueueResult, runsResult, supabaseQueueResult, actionedResult] = await Promise.allSettled([
      fundMonitoringAgentflow.getAlertQueue(),
      supabase
        .from("batch_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(14),
      supabase.from("v_alert_queue").select("*"),
      supabase.from("v_recently_actioned").select("*"),
    ]);

    const runs = runsResult.status === "fulfilled" ? runsResult.value.data : [];
    const actionedRows = actionedResult.status === "fulfilled" ? actionedResult.value.data : [];
    const supabaseQueue = supabaseQueueResult.status === "fulfilled" ? supabaseQueueResult.value.data : [];
    const agentQueue =
      agentQueueResult.status === "fulfilled" && agentQueueResult.value.length > 0
        ? agentQueueResult.value
        : null;

    if (agentQueue) {
      const agentRun = buildAgentflowRun(agentQueue as QueueRow[]);
      setAgentflowMode(true);
      setAllRuns([]);
      setLatestRun(agentRun);
      setQueue(agentQueue as QueueRow[]);
      setActioned([]);
      setLoading(false);
      return;
    }

    const runList = (runs ?? []) as BatchRun[];
    setAgentflowMode(false);
    setAllRuns(runList);
    setLatestRun(runList[0] ?? null);
    setQueue((supabaseQueue ?? []) as QueueRow[]);
    setActioned((actionedRows ?? []) as ActionedRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const trend = useMemo(() => {
    if (!allRuns.length) return null;
    const n = allRuns.length;
    const sumSrc = allRuns.reduce((s, r) => s + r.sources_scanned, 0);
    const sumProd = allRuns.reduce((s, r) => s + r.alerts_produced, 0);
    const sumCand = allRuns.reduce((s, r) => s + r.candidate_events, 0);
    const sumSupp = allRuns.reduce((s, r) => s + r.alerts_suppressed, 0);
    const suppressionRate = sumCand ? Math.round((sumSupp / sumCand) * 100) : 0;
    return {
      avgSources: Math.round(sumSrc / n),
      avgAlerts: Math.round(sumProd / n),
      suppressionRate,
    };
  }, [allRuns]);

  const chatScopeContext = useMemo(
    () => ({
      latest_batch_run: latestRun,
      alert_queue: queue.map((r) => ({
        tier: r.tier,
        fund_name: r.fund_name,
        ticker: r.ticker,
        headline: r.headline,
        category: r.category,
        ir_summary: r.ir_summary,
        classification_reason: r.classification_reason,
        time_pressure: r.time_pressure,
        confidence: r.confidence,
        source_publisher: r.source_publisher,
        event_date: r.event_date,
      })),
      recently_actioned: actioned.slice(0, 10).map((r) => ({
        status: r.status,
        fund_name: r.fund_name,
        headline: r.headline,
        reviewer_name: r.reviewer_name,
        reviewed_at: r.reviewed_at,
        edited_advisor_message: r.edited_advisor_message,
        rejection_reason: r.rejection_reason,
      })),
    }),
    [latestRun, queue, actioned]
  );

  const handleRerun = async () => {
    setRerunning(true);
    setRerunSteps([]);
    try {
      await runStepSequence(buildBatchGuardrailSteps(), { setSteps: setRerunSteps });
      await loadAll();
      toast({
        title: "Batch re-run complete",
        description: "6 alerts produced, 35 suppressed.",
      });
    } finally {
      setRerunning(false);
    }
  };

  const approve = async (alert: QueueRow) => {
    if (agentflowMode) {
      setQueue((prev) => prev.filter((row) => row.alert_id !== alert.alert_id));
      setActioned((prev) => [toActionedRow(alert, "approved"), ...prev]);
      setApproveTarget(null);
      toast({ title: "Alert approved", description: alert.headline ?? "" });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from("alerts")
      .update({
        status: "approved",
        reviewer_name: REVIEWER,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", alert.alert_id);
    setSubmitting(false);
    if (error) {
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Alert approved", description: alert.headline ?? "" });
    setApproveTarget(null);
    await loadAll();
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (agentflowMode) {
      setQueue((prev) => prev.filter((row) => row.alert_id !== editTarget.alert_id));
      setActioned((prev) => [toActionedRow(editTarget, "edited", editText), ...prev]);
      toast({ title: "Alert edited & approved" });
      setEditTarget(null);
      setEditText("");
      setEditNotes("");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from("alerts")
      .update({
        status: "edited",
        reviewer_name: REVIEWER,
        reviewed_at: new Date().toISOString(),
        edited_advisor_message: editText,
      })
      .eq("id", editTarget.alert_id);
    setSubmitting(false);
    if (error) {
      toast({ title: "Edit failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Alert edited & approved" });
    setEditTarget(null);
    setEditText("");
    setEditNotes("");
    await loadAll();
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason === "Other (specify)" ? rejectOther.trim() : rejectReason;
    if (!reason) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    if (agentflowMode) {
      setQueue((prev) => prev.filter((row) => row.alert_id !== rejectTarget.alert_id));
      setActioned((prev) => [toActionedRow(rejectTarget, "rejected", null, reason), ...prev]);
      toast({ title: "Alert rejected" });
      setRejectTarget(null);
      setRejectReason(REJECT_REASONS[0]);
      setRejectOther("");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase
      .from("alerts")
      .update({
        status: "rejected",
        reviewer_name: REVIEWER,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", rejectTarget.alert_id);
    setSubmitting(false);
    if (error) {
      toast({ title: "Rejection failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Alert rejected" });
    setRejectTarget(null);
    setRejectReason(REJECT_REASONS[0]);
    setRejectOther("");
    await loadAll();
  };

  const sortedQueue = useMemo(() => {
    return [...queue].sort((a, b) => {
      const t = (a.tier ?? 99) - (b.tier ?? 99);
      if (t !== 0) return t;
      return (b.event_date ?? "").localeCompare(a.event_date ?? "");
    });
  }, [queue]);

  const runTime = latestRun
    ? new Date(latestRun.started_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const runDuration =
    latestRun && latestRun.completed_at
      ? Math.round(
          (new Date(latestRun.completed_at).getTime() - new Date(latestRun.started_at).getTime()) /
            1000
        )
      : null;

  return (
    <div>
      <TopBar title="Daily operations">
        <ChatToggleButton open={chatOpen} onClick={() => setChatOpen((o) => !o)} />
      </TopBar>
      <div className="px-8 py-8 max-w-[1280px]">
        <p className="text-sm text-muted-foreground -mt-2 mb-6">
          Today's batch run, the alert queue awaiting review, and recent actions taken.
        </p>

        {/* Section 1 — Today's batch run */}
        {loading ? (
          <div className="border border-border rounded bg-card p-10 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : latestRun ? (
          <div className="border border-border rounded bg-card p-6">
            <div className="flex flex-wrap items-start gap-6">
              <div className="min-w-[200px]">
                <h2 className="text-lg font-semibold tracking-tight">
                  Today's run · {runTime}
                </h2>
                {runDuration != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Completed in {runDuration} seconds
                  </p>
                )}
              </div>

              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 min-w-[400px]">
                <StatTile label="Sources scanned" value={latestRun.sources_scanned} />
                <StatTile label="Candidate events" value={latestRun.candidate_events} />
                <StatTile label="Alerts produced" value={latestRun.alerts_produced} />
                <StatTile label="Suppressed as noise" value={latestRun.alerts_suppressed} />
              </div>

              <div>
                <Button
                  onClick={handleRerun}
                  disabled={rerunning}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {rerunning ? "Running…" : "Re-run batch"}
                </Button>
              </div>
            </div>

            {trend && (
              <div className="mt-5 pt-4 border-t border-border text-xs text-muted-foreground">
                14-day average: <span className="text-foreground font-medium">{trend.avgSources}</span>{" "}
                sources ·{" "}
                <span className="text-foreground font-medium">{trend.avgAlerts}</span> alerts ·{" "}
                <span className="text-foreground font-medium">{trend.suppressionRate}%</span>{" "}
                suppression
              </div>
            )}

            {(rerunning || rerunSteps.some((s) => s.status === "warning")) &&
              rerunSteps.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border">
                  <GuardrailSteps steps={rerunSteps} />
                </div>
              )}
          </div>
        ) : (
          <div className="border border-border rounded bg-card p-10 text-sm text-muted-foreground">
            No batch runs yet.
          </div>
        )}

        {/* Section 2 — Alert queue */}
        <div className="mt-10">
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-base font-semibold tracking-tight">Alert queue</h2>
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-sm bg-primary/10 text-primary">
              {sortedQueue.length} pending review
            </span>
          </div>

          {sortedQueue.length === 0 ? (
            <div className="border border-dashed border-border rounded p-10 text-center text-sm text-muted-foreground">
              Queue clear. All alerts from today's batch have been actioned.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedQueue.map((row) => (
                <QueueCard
                  key={row.alert_id}
                  row={row}
                  expanded={!!expandedQueue[row.alert_id]}
                  onToggle={() =>
                    setExpandedQueue((p) => ({ ...p, [row.alert_id]: !p[row.alert_id] }))
                  }
                  onApprove={() => setApproveTarget(row)}
                  onEdit={() => {
                    setEditTarget(row);
                    setEditText(row.advisor_message ?? "");
                    setEditNotes("");
                  }}
                  onReject={() => {
                    setRejectTarget(row);
                    setRejectReason(REJECT_REASONS[0]);
                    setRejectOther("");
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Section 3 — Recently actioned */}
        <div className="mt-10">
          <h2 className="text-base font-semibold tracking-tight mb-4">Recently actioned</h2>
          {actioned.length === 0 ? (
            <div className="text-sm text-muted-foreground">No reviewed alerts yet.</div>
          ) : (
            <div className="border border-border rounded bg-card divide-y divide-border">
              {actioned.map((row) => (
                <ActionedRowItem
                  key={row.alert_id}
                  row={row}
                  expanded={!!expandedActioned[row.alert_id]}
                  onToggle={() =>
                    setExpandedActioned((p) => ({ ...p, [row.alert_id]: !p[row.alert_id] }))
                  }
                />
              ))}
            </div>
          )}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="mt-3 text-xs text-primary hover:underline"
          >
            View full audit trail →
          </button>
        </div>
      </div>

      {/* Approve modal */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve & send</DialogTitle>
            <DialogDescription>
              Approve this alert and mark advisor message as ready to distribute?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={submitting}
              onClick={() => approveTarget && approve(approveTarget)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit advisor message before sending</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Original system-generated message
              </div>
              <div className="text-sm bg-muted/50 border border-border rounded p-3 text-muted-foreground">
                {editTarget?.advisor_message}
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                Your edits
              </label>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={6}
                className="w-full text-sm border border-input rounded p-3 bg-background"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1.5">
                Reviewer notes (optional)
              </label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                placeholder="Why are you editing this?"
                className="w-full text-sm border border-input rounded p-3 bg-background"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={submitting || !editText.trim()}
              onClick={submitEdit}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Save & approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject modal */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this alert?</DialogTitle>
            <DialogDescription>Please select a reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <select
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              {REJECT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {rejectReason === "Other (specify)" && (
              <input
                value={rejectOther}
                onChange={(e) => setRejectOther(e.target.value)}
                placeholder="Specify reason"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={submitting}
              onClick={submitReject}
              variant="destructive"
            >
              Confirm rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChatPanel
        scope="daily_operations"
        scopeContext={chatScopeContext}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-3xl font-semibold text-primary tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );
}

function QueueCard({
  row,
  expanded,
  onToggle,
  onApprove,
  onEdit,
  onReject,
}: {
  row: QueueRow;
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
}) {
  return (
    <div className="border border-border rounded bg-card overflow-hidden">
      <div
        className="px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-[11px] uppercase tracking-wider text-muted-foreground">
              {row.tier != null && <TierBadge tier={row.tier} />}
              {row.event_date && (
                <span>
                  {new Date(row.event_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
              {row.ticker && (
                <span className="text-foreground font-semibold">
                  {row.ticker}
                </span>
              )}
              {row.fund_name && <span className="normal-case">{row.fund_name}</span>}
              {row.category && (
                <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded-sm">
                  {categoryLabel(row.category)}
                </span>
              )}
            </div>
            <div className="text-base font-semibold mt-2 leading-snug">{row.headline}</div>
            <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
              {row.source_publisher && <span>{row.source_publisher}</span>}
              {row.time_pressure && (
                <>
                  <span>·</span>
                  <span>{row.time_pressure}</span>
                </>
              )}
              {row.confidence != null && (
                <>
                  <span>·</span>
                  <span>{Math.round(row.confidence * 100)}% confidence</span>
                </>
              )}
            </div>
            {!expanded && row.ir_summary && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {row.ir_summary.length > 140
                  ? row.ir_summary.slice(0, 140) + "…"
                  : row.ir_summary}
              </p>
            )}
          </div>

          <div
            className="flex flex-col gap-2 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              onClick={onApprove}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Approve & send
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit before sending
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onReject}
              className="text-muted-foreground hover:text-destructive"
            >
              Reject
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-1 border-t border-border bg-muted/20 space-y-4">
          <DetailBlock label="What happened" body={row.raw_summary} />
          <DetailBlock label="System alert" body={row.ir_summary} />
          <DetailBlock label="Recommended action" body={row.ir_action} />
          {row.classification_reason && (
            <DetailBlock label="Why this tier" body={row.classification_reason} small />
          )}
          {row.advisor_message && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Advisor message
              </div>
              <div className="border-l-4 border-primary bg-background p-3 text-sm">
                {row.advisor_message}
              </div>
            </div>
          )}
          <GovernanceTrail alertId={row.alert_id} sourcePublisher={row.source_publisher} />
        </div>
      )}
    </div>
  );
}

function ActionedRowItem({
  row,
  expanded,
  onToggle,
}: {
  row: ActionedRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = row.status ?? "";
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-5 py-3 text-left hover:bg-muted/30 transition-colors flex items-center gap-3"
      >
        <StatusBadge status={status} />
        <span className="text-xs text-muted-foreground w-44 shrink-0 truncate">
          {row.reviewer_name ?? "—"}
        </span>
        <span className="text-sm flex-1 min-w-0 truncate">{row.headline}</span>
        {row.ticker && (
          <span className="text-xs font-semibold text-foreground shrink-0">{row.ticker}</span>
        )}
        <span className="text-xs text-muted-foreground shrink-0 w-24 text-right">
          {timeAgo(row.reviewed_at)}
        </span>
      </button>
      {expanded && (
        <div className="px-5 pb-4 pt-1 bg-muted/20 space-y-3">
          {row.original_advisor_message && (
            <DetailBlock
              label={
                row.status === "edited" ? "Original advisor message" : "Advisor message"
              }
              body={row.original_advisor_message}
            />
          )}
          {row.status === "edited" && row.edited_advisor_message && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Final (edited) advisor message
              </div>
              <div className="border-l-4 border-primary bg-background p-3 text-sm">
                {row.edited_advisor_message}
              </div>
            </div>
          )}
          {row.status === "rejected" && row.rejection_reason && (
            <DetailBlock label="Rejection reason" body={row.rejection_reason} />
          )}
          <GovernanceTrail alertId={row.alert_id} />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; label: string }> = {
    approved: { bg: "bg-primary text-primary-foreground", label: "Approved" },
    edited: { bg: "bg-mid text-mid-foreground", label: "Edited" },
    rejected: { bg: "bg-[hsl(220_9%_60%)] text-white", label: "Rejected" },
    sent: { bg: "bg-primary text-primary-foreground", label: "Sent" },
  };
  const c = cfg[status] ?? { bg: "bg-muted text-muted-foreground", label: status };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-sm shrink-0 w-20 justify-center",
        c.bg
      )}
    >
      {c.label}
    </span>
  );
}

function DetailBlock({
  label,
  body,
  small,
}: {
  label: string;
  body: string | null;
  small?: boolean;
}) {
  if (!body) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className={cn("text-sm leading-relaxed", small && "text-xs text-muted-foreground")}>
        {body}
      </div>
    </div>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return formatDate(iso);
}
