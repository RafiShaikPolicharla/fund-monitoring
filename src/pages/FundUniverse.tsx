import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import { formatAum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fundMonitoringAgentflow } from "@/services/fundMonitoringAgentflow";

type Row = {
  id: string;
  ticker: string | null;
  name: string;
  asset_class: string;
  aum_usd_billions: number | null;
  named_pms: string[] | null;
  pilot: boolean | null;
  manager_name: string | null;
};

type SortKey = "ticker" | "name" | "manager_name" | "asset_class" | "aum_usd_billions";

export default function FundUniverse() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const agentRows = await fundMonitoringAgentflow.getFundUniverse();
        if (agentRows.length > 0) {
          setRows(agentRows);
          setLoading(false);
          return;
        }
      } catch {
        // Fall back to Supabase fixture data below.
      }

      const { data } = await supabase
        .from("funds")
        .select("id, ticker, name, asset_class, aum_usd_billions, named_pms, pilot, managers(name)")
        .eq("approved_list", true);
      setRows(
        ((data ?? []) as any[]).map((f) => ({
          ...f,
          manager_name: f.managers?.name ?? null,
        }))
      );
      setLoading(false);
    })();
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div>
      <TopBar title="Approved Fund Universe" />
      <div className="px-8 py-8 max-w-[1400px]">
        <p className="text-sm text-muted-foreground mb-6">
          {rows.length} approved-list funds. The system is built to extend beyond the pilot pair.
        </p>
        <div className="border border-border rounded bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-panel border-b border-border">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <Th sortKey="ticker" current={sortKey} dir={sortDir} onClick={toggleSort}>
                  Ticker
                </Th>
                <Th sortKey="name" current={sortKey} dir={sortDir} onClick={toggleSort}>
                  Fund name
                </Th>
                <Th sortKey="manager_name" current={sortKey} dir={sortDir} onClick={toggleSort}>
                  Manager
                </Th>
                <Th sortKey="asset_class" current={sortKey} dir={sortDir} onClick={toggleSort}>
                  Asset class
                </Th>
                <Th sortKey="aum_usd_billions" current={sortKey} dir={sortDir} onClick={toggleSort} align="right">
                  AUM
                </Th>
                <th className="px-4 py-2.5 font-semibold">Named PMs</th>
                <th className="px-4 py-2.5 font-semibold">Pilot</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-panel/60">
                    <td className="px-4 py-3 font-medium tabular-nums">{r.ticker ?? "—"}</td>
                    <td className="px-4 py-3">{r.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.manager_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.asset_class}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatAum(r.aum_usd_billions)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {(r.named_pms ?? []).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.pilot && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-primary text-primary-foreground rounded-sm font-semibold">
                          Pilot
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  sortKey,
  current,
  dir,
  onClick,
  align,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "right";
}) {
  const active = sortKey === current;
  return (
    <th
      className={cn(
        "px-4 py-2.5 font-semibold cursor-pointer select-none",
        align === "right" && "text-right",
        active && "text-foreground"
      )}
      onClick={() => onClick(sortKey)}
    >
      {children} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}
