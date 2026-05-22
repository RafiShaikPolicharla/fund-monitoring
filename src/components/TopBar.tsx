import { ReactNode } from "react";

export default function TopBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-b border-border bg-background">
      <div className="px-8 py-4 flex items-center justify-between">
        <h1 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h1>
        <div className="flex items-center gap-3">
          {children}
          <span className="text-[10px] font-semibold tracking-widest px-2 py-0.5 border border-primary text-primary rounded-sm">
            DEMO
          </span>
        </div>
      </div>
    </div>
  );
}
