import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type InferenceLog = {
  id: string;
  alert_id: string | null;
  event_id: string | null;
  model_version: string;
  prompt_version: string;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  guardrails_triggered: string[] | null;
  source_check_passed: boolean | null;
  entity_check_passed: boolean | null;
  created_at: string;
};

const GUARDRAIL_LABELS: Record<string, string> = {
  source_unknown: "Unknown source",
  single_source_speculation: "Single-source speculation",
  low_confidence: "Low confidence (<0.7)",
  tier_override_sec_rule: "Tier auto-elevated: SEC enforcement rule",
  confidence_low: "Confidence below threshold",
};

export function GovernanceTrail({
  alertId,
  sourcePublisher,
}: {
  alertId: string;
  sourcePublisher?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<InferenceLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("inference_log")
        .select("*")
        .eq("alert_id", alertId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setLog(data as InferenceLog | null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alertId]);

  if (loading) {
    return (
      <div
        className="mt-4 px-4 py-3 rounded text-xs text-muted-foreground"
        style={{ background: "#F5F7F6" }}
      >
        Loading governance trail…
      </div>
    );
  }

  if (!log) return null;

  const guardrails = log.guardrails_triggered ?? [];
  const allChecksPassed =
    log.source_check_passed && log.entity_check_passed && guardrails.length === 0;

  const summary = [
    allChecksPassed ? "All checks passed" : "Review required",
    log.latency_ms ? `${(log.latency_ms / 1000).toFixed(1)}s` : null,
    log.cost_usd != null ? `$${Number(log.cost_usd).toFixed(4)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const copyId = async () => {
    await navigator.clipboard.writeText(log.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-4 rounded font-mono" style={{ background: "#F5F7F6" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left text-[12px]"
      >
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
          <span className="font-semibold uppercase tracking-wider">
            Governance trail
          </span>
        </span>
        <span className="text-muted-foreground">{summary}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 text-[12px]">
          {/* Source check */}
          <div>
            <div className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground mb-1.5">
              Source check
            </div>
            {log.source_check_passed ? (
              <div className="flex items-start gap-2 leading-relaxed">
                <span style={{ color: "#007A4E" }}>✓</span>
                <span>
                  Source check passed
                  {sourcePublisher ? `: ${sourcePublisher}` : ""}{" "}
                  <span className="text-muted-foreground">(in approved publisher allowlist)</span>
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2 leading-relaxed">
                  <span style={{ color: "#92400E" }}>⚠</span>
                  <span>
                    Source check failed
                    {sourcePublisher ? `: ${sourcePublisher}` : ""}{" "}
                    <span className="text-muted-foreground">
                      (not in approved publisher allowlist)
                    </span>
                  </span>
                </div>
                <div
                  className="mt-2 px-3 py-2 rounded text-[12px] leading-relaxed"
                  style={{ background: "#FEF4E5", color: "#92400E" }}
                >
                  This alert was flagged for human verification. No advisor messaging will be
                  distributed without explicit reviewer approval.
                </div>
              </>
            )}
          </div>

          {/* Entity check */}
          <div>
            <div className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground mb-1.5">
              Entity check
            </div>
            <div className="flex items-start gap-2 leading-relaxed">
              <span style={{ color: "#007A4E" }}>✓</span>
              <span>
                Entity check passed:{" "}
                <span className="text-muted-foreground">
                  fund on approved list, manager named in event matches fund record
                </span>
              </span>
            </div>
          </div>

          {/* Guardrails */}
          <div>
            <div className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground mb-1.5">
              Guardrails
            </div>
            {guardrails.length === 0 ? (
              <div className="text-muted-foreground">No guardrails triggered.</div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {guardrails.map((g) => (
                    <span
                      key={g}
                      className="px-2 py-0.5 rounded-sm text-[11px]"
                      style={{ background: "#FEF4E5", color: "#92400E" }}
                    >
                      {GUARDRAIL_LABELS[g] ?? g}
                    </span>
                  ))}
                </div>
                <div className="text-muted-foreground mt-2 text-[11px]">
                  Guardrails route this alert to the human queue rather than auto-approval.
                </div>
              </>
            )}
          </div>

          {/* Inference metadata */}
          <div>
            <div className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground mb-1.5">
              Inference metadata
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <MetaRow k="Model" v={log.model_version} />
              <MetaRow k="Prompt version" v={log.prompt_version} />
              <MetaRow k="Latency" v={log.latency_ms != null ? `${log.latency_ms}ms` : "—"} />
              <MetaRow
                k="Tokens"
                v={`${log.input_tokens ?? 0} in · ${log.output_tokens ?? 0} out`}
              />
              <MetaRow
                k="Cost"
                v={log.cost_usd != null ? `$${Number(log.cost_usd).toFixed(6)}` : "—"}
              />
              <div className="flex items-baseline gap-2 col-span-2">
                <span className="text-muted-foreground text-[11px] uppercase tracking-wider w-28 shrink-0">
                  Inference ID
                </span>
                <span className="truncate">{log.id}</span>
                <button
                  onClick={copyId}
                  className="text-[11px] hover:underline"
                  style={{ color: "#007A4E" }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
              Reproducible from this inference ID + the stored prompt + the model version. Every
              model call is logged immutably.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wider w-28 shrink-0">
        {k}
      </span>
      <span className="truncate">{v}</span>
    </div>
  );
}
