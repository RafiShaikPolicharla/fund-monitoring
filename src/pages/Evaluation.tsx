import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import { cn } from "@/lib/utils";

type EvalRow = {
  id: string;
  eval_run_date: string;
  fund_universe: string;
  lookback_months: number;
  total_events: number;
  tier1_recall: number | null;
  tier1_precision: number | null;
  tier3_precision: number | null;
  action_match_rate: number | null;
  human_override_rate: number | null;
  confusion_matrix: ConfusionMatrix | null;
  disagreements: Disagreement[] | null;
  notes: string | null;
};

type ConfusionRow = {
  actual_tier_1: number;
  actual_tier_2: number;
  actual_tier_3: number;
  actual_none: number;
};

type ConfusionMatrix = {
  system_tier_1: ConfusionRow;
  system_tier_2: ConfusionRow;
  system_tier_3: ConfusionRow;
  system_suppressed?: ConfusionRow;
};

type Disagreement = {
  event_headline: string;
  system_tier: number;
  actual_tier: number;
  note: string;
};

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${Math.round(v * 100)}%`;

export default function Evaluation() {
  const [evalRow, setEvalRow] = useState<EvalRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("evaluation_results")
        .select("*")
        .order("eval_run_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      setEvalRow(data as unknown as EvalRow | null);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <TopBar title="Retrospective evaluation" />
      <div className="px-8 py-8 max-w-[1280px]">
        <p className="text-sm text-muted-foreground -mt-2 mb-6">
          Validating the system against the IR team's documented decisions on the past 12 months.
        </p>

        {loading ? (
          <div className="border border-border rounded bg-card p-10 text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !evalRow ? (
          <div className="border border-border rounded bg-card p-10 text-sm text-muted-foreground">
            No evaluation results yet.
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-6">
              Evaluated {new Date(evalRow.eval_run_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              · {evalRow.fund_universe} ({evalRow.lookback_months}-month lookback) ·{" "}
              {evalRow.total_events} events
            </div>

            {/* Big stat tiles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BigTile
                value={pct(evalRow.tier1_recall)}
                label="Tier-1 recall"
                caption="Of events the IR team treated as Tier 1, the system surfaced as Tier 1"
              />
              <BigTile
                value={pct(evalRow.tier3_precision)}
                label="Tier-3 precision"
                caption={`Of events the system suppressed, only ${
                  evalRow.tier3_precision != null
                    ? Math.round((1 - evalRow.tier3_precision) * 100)
                    : "—"
                }% were ones IR would have wanted to see`}
              />
              <BigTile
                value={pct(evalRow.action_match_rate)}
                label="Action match"
                caption="On Tier 1/2 alerts, the system's recommended action matched IR's documented action"
              />
            </div>

            {/* Secondary stats */}
            <div className="mt-4 text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
              <span>
                Tier-1 precision:{" "}
                <span className="text-foreground font-medium">
                  {pct(evalRow.tier1_precision)}
                </span>
              </span>
              <span>
                Human override rate:{" "}
                <span className="text-foreground font-medium">
                  {pct(evalRow.human_override_rate)}
                </span>
              </span>
            </div>

            {/* Confusion matrix */}
            {evalRow.confusion_matrix && (
              <section className="mt-10">
                <h2 className="text-base font-semibold tracking-tight mb-3">
                  System tier vs. actual tier
                </h2>
                <ConfusionMatrixTable matrix={evalRow.confusion_matrix} />
                <p className="text-xs text-muted-foreground mt-3">
                  Diagonal cells are correct classifications. Off-diagonal cells are disagreements
                  with the IR team's documented decisions.
                </p>
              </section>
            )}

            {/* Disagreements */}
            {evalRow.disagreements && evalRow.disagreements.length > 0 && (
              <section className="mt-10">
                <h2 className="text-base font-semibold tracking-tight mb-4">
                  Where the system disagreed with IR
                </h2>
                <div className="space-y-3">
                  {evalRow.disagreements.map((d, i) => (
                    <DisagreementCard key={i} d={d} />
                  ))}
                </div>
                <div
                  className="mt-5 px-4 py-3 rounded text-sm leading-relaxed"
                  style={{ background: "#F5F7F6" }}
                >
                  <strong>Showing disagreements is what makes the eval credible.</strong> The
                  system catches what the IR team would catch with high reliability, but it isn't
                  perfect — these cases are the ones we're targeting in the next prompt iteration
                  and in Phase 2's agentic decomposition.
                </div>
              </section>
            )}

            {/* Notes */}
            {evalRow.notes && (
              <section className="mt-10">
                <h2 className="text-base font-semibold tracking-tight mb-3">Notes</h2>
                <div
                  className="px-4 py-3 rounded text-sm leading-relaxed text-muted-foreground"
                  style={{ background: "#F5F7F6" }}
                >
                  {evalRow.notes}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Re-running planned weekly post-launch. Production evaluation will sample 5% of
                  alerts with human verification.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BigTile({
  value,
  label,
  caption,
}: {
  value: string;
  label: string;
  caption: string;
}) {
  return (
    <div className="border border-border rounded bg-card p-5">
      <div className="text-4xl font-semibold tabular-nums" style={{ color: "#007A4E" }}>
        {value}
      </div>
      <div className="text-sm font-medium mt-1.5">{label}</div>
      <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{caption}</div>
    </div>
  );
}

function ConfusionMatrixTable({ matrix }: { matrix: ConfusionMatrix }) {
  const rows: { key: keyof ConfusionMatrix; label: string; diagKey: keyof ConfusionRow }[] = [
    { key: "system_tier_1", label: "System T1", diagKey: "actual_tier_1" },
    { key: "system_tier_2", label: "System T2", diagKey: "actual_tier_2" },
    { key: "system_tier_3", label: "System T3", diagKey: "actual_tier_3" },
  ];
  const cols: { key: keyof ConfusionRow; label: string }[] = [
    { key: "actual_tier_1", label: "Actual T1" },
    { key: "actual_tier_2", label: "Actual T2" },
    { key: "actual_tier_3", label: "Actual T3" },
    { key: "actual_none", label: "Actually noise" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse" style={{ borderColor: "#D9DBD9" }}>
        <thead>
          <tr>
            <th
              className="text-left p-3 border font-semibold text-muted-foreground"
              style={{ borderColor: "#D9DBD9", background: "#F5F7F6" }}
            ></th>
            {cols.map((c) => (
              <th
                key={c.key}
                className="text-center p-3 border text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                style={{ borderColor: "#D9DBD9", background: "#F5F7F6" }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rowData = matrix[r.key] as ConfusionRow | undefined;
            if (!rowData) return null;
            return (
              <tr key={r.key}>
                <th
                  className="text-left p-3 border font-semibold"
                  style={{ borderColor: "#D9DBD9", background: "#F5F7F6" }}
                >
                  {r.label}
                </th>
                {cols.map((c) => {
                  const val = rowData[c.key];
                  const isDiag = c.key === r.diagKey;
                  const isOff = !isDiag && val > 0;
                  const style: React.CSSProperties = {
                    borderColor: "#D9DBD9",
                  };
                  if (isDiag && val > 0) {
                    style.background = "#E8F5EE";
                    style.color = "#005436";
                  } else if (isOff) {
                    style.background = "#FEF4E5";
                    style.color = "#92400E";
                  }
                  return (
                    <td
                      key={c.key}
                      className="text-center p-3 border tabular-nums"
                      style={style}
                    >
                      {val}
                      {isDiag && val > 0 ? " ✓" : ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DisagreementCard({ d }: { d: Disagreement }) {
  return (
    <div className="border border-border rounded bg-card p-4">
      <div className="text-sm font-semibold leading-snug">{d.event_headline}</div>
      <div className="flex items-center gap-2 mt-2">
        <span
          className="px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider"
          style={{ background: "#F5F7F6", color: "#005436" }}
        >
          System: T{d.system_tier}
        </span>
        <span
          className="px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider"
          style={{ background: "#FEF4E5", color: "#92400E" }}
        >
          Actual: T{d.actual_tier}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{d.note}</p>
    </div>
  );
}
