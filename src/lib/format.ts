export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatAum(billions: number | null | undefined): string {
  if (billions == null) return "—";
  if (billions >= 1) return `$${billions.toFixed(1)}B`;
  return `$${(billions * 1000).toFixed(0)}M`;
}

export const tierLabel = (t: number) => `Tier ${t}`;

export function tierClasses(tier: number): string {
  if (tier === 1) return "bg-primary text-primary-foreground";
  if (tier === 2) return "bg-mid text-mid-foreground";
  return "bg-[hsl(220_13%_91%)] text-[hsl(0_0%_25%)]";
}

export function tierDot(tier: number): string {
  if (tier === 1) return "bg-primary border-primary";
  if (tier === 2) return "border-mid bg-transparent";
  return "border-muted-foreground/40 bg-transparent";
}

export const categoryLabel = (c: string) =>
  ({ manager: "Manager", regulatory: "Regulatory", corporate: "Corporate", operations: "Operations", performance: "Performance" })[c] || c;
