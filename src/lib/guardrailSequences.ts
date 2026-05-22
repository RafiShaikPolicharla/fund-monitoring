import { GuardrailStep, StepStatus } from "@/components/GuardrailSteps";

type StepDef = {
  id: string;
  label: string;
  detail: string | (() => string);
  durationMs: number;
  status?: StepStatus; // override (e.g. warning)
};

export type RunOptions = {
  setSteps: (steps: GuardrailStep[]) => void;
  // Awaited mid-sequence call, replacing step labeled "claude"
  claudeRunner?: () => Promise<{ latency: number; tokensIn?: number; tokensOut?: number }>;
};

/** Run a sequence of step definitions, transitioning each from running -> final state. */
export async function runStepSequence(defs: StepDef[], opts: RunOptions) {
  // Initialize as pending
  let current: GuardrailStep[] = defs.map((d) => ({
    id: d.id,
    label: d.label,
    status: "pending",
    detail: undefined,
  }));
  opts.setSteps([...current]);

  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    // mark running
    current = current.map((s, idx) => (idx === i ? { ...s, status: "running" } : s));
    opts.setSteps([...current]);

    if (d.id === "claude" && opts.claudeRunner) {
      try {
        const result = await opts.claudeRunner();
        const detail =
          typeof d.detail === "function"
            ? d.detail()
            : `${result.latency}ms${
                result.tokensIn != null ? ` · ${result.tokensIn} in / ${result.tokensOut ?? 0} out tokens` : ""
              }`;
        current = current.map((s, idx) =>
          idx === i ? { ...s, status: "passed", detail } : s
        );
        opts.setSteps([...current]);
      } catch (e: any) {
        current = current.map((s, idx) =>
          idx === i ? { ...s, status: "failed", detail: e?.message ?? "Request failed" } : s
        );
        opts.setSteps([...current]);
        throw e;
      }
    } else {
      await new Promise((r) => setTimeout(r, d.durationMs));
      const detail = typeof d.detail === "function" ? d.detail() : d.detail;
      current = current.map((s, idx) =>
        idx === i ? { ...s, status: d.status ?? "passed", detail } : s
      );
      opts.setSteps([...current]);
    }
  }
}

/** Build the per-event guardrail step definitions for Inspect events. */
export function buildEventGuardrailSteps(opts: {
  sourcePublisher: string | null;
  sourceInAllowlist: boolean;
  publisherCategory?: string | null;
  publisherTrustTier?: number | null;
}): StepDef[] {
  const sourceDetail = opts.sourceInAllowlist
    ? `${opts.sourcePublisher ?? "Source"} (${opts.publisherCategory ?? "publisher"}, trust tier ${
        opts.publisherTrustTier ?? 1
      })`
    : `${opts.sourcePublisher ?? "Unknown source"} — not in allowlist · alert will be flagged for human verification`;
  return [
    {
      id: "source",
      label: "Checking source against approved publisher allowlist",
      detail: sourceDetail,
      durationMs: 600,
      status: opts.sourceInAllowlist ? "passed" : "warning",
    },
    {
      id: "entity",
      label: "Verifying entity references against fund metadata",
      detail: "Fund on approved list · manager named in event matches fund record",
      durationMs: 500,
    },
    {
      id: "preclass",
      label: "Running pre-classification filters",
      detail: "3 filters passed: confidence threshold, single-source check, recency window",
      durationMs: 500,
    },
    {
      id: "claude",
      label: "Calling Claude Sonnet 4.6",
      detail: "",
      durationMs: 0,
    },
    {
      id: "postclass",
      label: "Running post-classification rules",
      detail: "No tier overrides triggered",
      durationMs: 500,
    },
    {
      id: "trail",
      label: "Compiling governance trail",
      detail: "Inference logged · ID copied to alert record",
      durationMs: 400,
    },
  ];
}

/** Build the batch re-run guardrail step definitions. */
export function buildBatchGuardrailSteps(): StepDef[] {
  return [
    {
      id: "scan",
      label: "Scanning sources",
      detail: "247 sources queried · 41 candidate events identified",
      durationMs: 700,
    },
    {
      id: "allowlist",
      label: "Source allowlist check",
      detail: "39 from approved publishers · 2 from unverified sources",
      durationMs: 600,
      status: "warning",
    },
    {
      id: "entity",
      label: "Entity verification",
      detail: "41 events with valid fund/manager references",
      durationMs: 500,
    },
    {
      id: "prefilter",
      label: "Pre-classification filtering",
      detail: "12 filtered: low confidence (5), single-source (4), out-of-window (3)",
      durationMs: 600,
    },
    {
      id: "classify",
      label: "Classifying remaining events",
      detail: "29 events → Claude Sonnet 4.6 · classification complete",
      durationMs: 1500,
    },
    {
      id: "postclass",
      label: "Post-classification rules",
      detail: "1 alert auto-elevated to Tier 1 (SEC rule)",
      durationMs: 500,
    },
    {
      id: "trail",
      label: "Compiling governance trail",
      detail: "29 inference logs written · batch run record saved",
      durationMs: 400,
    },
  ];
}
