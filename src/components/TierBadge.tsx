import { cn } from "@/lib/utils";
import { tierClasses } from "@/lib/format";

export default function TierBadge({ tier, size = "sm" }: { tier: number; size?: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold tracking-wide rounded-sm",
        tierClasses(tier),
        size === "lg" ? "text-sm px-3 py-1" : "text-[11px] px-2 py-0.5"
      )}
    >
      T{tier} · TIER {tier}
    </span>
  );
}
