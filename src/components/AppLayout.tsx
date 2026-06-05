import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Daily operations", end: true },
  { to: "/inspect", label: "Inspect events" },
  { to: "/evaluation", label: "Evaluation" },
  { to: "/funds", label: "Fund universe" },
];

const buildDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function AppLayout() {
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="text-[15px] font-semibold tracking-tight">Fund Monitoring</div>
          <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60 mt-0.5">
            Research & Alerting
          </div>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "block px-5 py-2.5 text-[13px] border-l-2 transition-colors",
                  isActive
                    ? "border-sidebar-primary bg-sidebar-accent text-sidebar-foreground"
                    : "border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-[11px] text-sidebar-foreground/50 border-t border-sidebar-border">
          Demo build · {buildDate}
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
