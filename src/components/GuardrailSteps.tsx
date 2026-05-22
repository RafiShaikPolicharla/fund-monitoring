import { cn } from "@/lib/utils";

export type StepStatus = "pending" | "running" | "passed" | "warning" | "failed";

export type GuardrailStep = {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
};

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "pending") {
    return <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 shrink-0" />;
  }
  if (status === "running") {
    return (
      <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0 animate-pulse ring-2 ring-primary/30" />
    );
  }
  if (status === "passed") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-primary" fill="currentColor">
        <path d="M6.5 11.5L3 8l1-1 2.5 2.5L12 4l1 1z" />
      </svg>
    );
  }
  if (status === "warning") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 shrink-0"
        fill="hsl(38 92% 50%)"
      >
        <path d="M8 1L1 14h14L8 1zm0 5v4M8 11.5v.5" stroke="hsl(38 92% 50%)" strokeWidth="1.2" />
        <circle cx="8" cy="12" r="0.7" fill="white" />
        <rect x="7.4" y="6" width="1.2" height="4" fill="white" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-destructive" fill="currentColor">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function GuardrailSteps({ steps }: { steps: GuardrailStep[] }) {
  return (
    <ul
      className="space-y-2 rounded border border-border p-4"
      style={{ background: "#F5F7F6", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      {steps.map((s) => {
        const muted = s.status === "pending";
        return (
          <li
            key={s.id}
            className={cn(
              "text-[12px] flex items-start gap-2.5 leading-snug",
              muted && "text-muted-foreground/60"
            )}
          >
            <span className="mt-1">
              <StatusIcon status={s.status} />
            </span>
            <span className="flex-1 min-w-0">
              <span className={cn("font-medium", s.status === "warning" && "text-foreground")}>
                {s.label}
              </span>
              {s.detail && (
                <span
                  className={cn(
                    "ml-2 text-muted-foreground",
                    s.status === "warning" && "text-[hsl(38_60%_35%)]"
                  )}
                >
                  — {s.detail}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
