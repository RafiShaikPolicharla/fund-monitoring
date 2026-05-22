import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ChatScope = "daily_operations" | "inspect_events";

type ChatMessage = {
  role: "user" | "assistant" | "system-error";
  content: string;
  latency?: number;
  cost?: number;
  systemPrompt?: string;
  userPrompt?: string;
};

const SUGGESTED: Record<ChatScope, string[]> = {
  daily_operations: [
    "What's highest priority in the queue?",
    "Why was the DoubleLine alert flagged?",
    "Are there any patterns across today's batch?",
    "Which alerts can probably be approved without edits?",
    "Walk me through the SEC inquiry alert",
  ],
  inspect_events: [
    "Why was this tiered as it was?",
    "What guardrails fired on this event?",
    "How does this compare to similar past events?",
    "Walk me through the prompt the model received",
    "What should I think about when reviewing this?",
  ],
};

const SCOPE_LABEL: Record<ChatScope, string> = {
  daily_operations: "Daily operations",
  inspect_events: "Inspect events",
};

const SCOPE_PLACEHOLDER: Record<ChatScope, string> = {
  daily_operations: "Ask about the queue...",
  inspect_events: "Ask about the event...",
};

export function ChatPanel({
  scope,
  scopeContext,
  open,
  onOpenChange,
}: {
  scope: ChatScope;
  scopeContext: Record<string, unknown>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [promptOpen, setPromptOpen] = useState<{ system: string; user: string } | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset when scope changes
  useEffect(() => {
    setSessionId(null);
    setMessages([]);
  }, [scope]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: trimmed }]);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat-scoped", {
        body: {
          session_id: sessionId,
          scope,
          scope_context: scopeContext,
          message: trimmed,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.session_id) setSessionId(data.session_id);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.message ?? "",
          latency: data.latency_ms,
          cost: data.cost_usd,
        },
      ]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          role: "system-error",
          content: e?.message ?? "Sorry — couldn't reach the model. Try again?",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setSessionId(null);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  if (!open) return null;

  const empty = messages.length === 0;

  return (
    <>
      <aside
        className="fixed right-0 top-0 bottom-0 w-[400px] bg-card border-l border-border shadow-2xl flex flex-col z-40"
        aria-label="Assistant chat panel"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">Ask the assistant</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Scoped to {SCOPE_LABEL[scope]} — answers questions about what's visible.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={clear}
              className="text-[11px] text-primary hover:underline"
              disabled={empty && !sending}
            >
              Clear chat
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
              aria-label="Close chat"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {empty && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground leading-relaxed bg-muted/40 rounded p-3 border border-border">
                I can help you reason through what's on this page. I cannot take actions —
                you'll always do that yourself in the UI.
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Try asking
                </div>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTED[scope].map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="text-left text-xs px-3 py-2 rounded border border-border bg-background hover:bg-muted/60 hover:border-primary transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              msg={m}
              onViewPrompt={
                m.systemPrompt && m.userPrompt
                  ? () => setPromptOpen({ system: m.systemPrompt!, user: m.userPrompt! })
                  : undefined
              }
            />
          ))}

          {sending && (
            <div className="flex gap-2 items-center text-xs text-muted-foreground pl-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span>Thinking…</span>
            </div>
          )}
        </div>

        {/* Suggested chips above input (when not empty) */}
        {!empty && (
          <div className="px-4 pt-2 border-t border-border">
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED[scope].slice(0, 3).map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={sending}
                  className="text-[11px] px-2 py-1 rounded-full border border-border bg-background hover:bg-muted/60 hover:border-primary transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className={cn("p-3 border-border", empty ? "border-t" : "")}>
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={2}
              placeholder={SCOPE_PLACEHOLDER[scope]}
              className="flex-1 text-sm border border-input rounded p-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={sending}
            />
            <Button
              size="sm"
              onClick={() => send(input)}
              disabled={sending || !input.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-9"
            >
              Send
            </Button>
          </div>
        </div>
      </aside>

      <Dialog open={!!promptOpen} onOpenChange={(o) => !o && setPromptOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prompt sent to the model</DialogTitle>
          </DialogHeader>
          {promptOpen && (
            <div className="space-y-4">
              <PromptBlock label="System prompt" content={promptOpen.system} />
              <PromptBlock label="User prompt (with visible context)" content={promptOpen.user} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageBubble({
  msg,
  onViewPrompt,
}: {
  msg: ChatMessage;
  onViewPrompt?: () => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] text-sm px-3 py-2 rounded-lg whitespace-pre-wrap leading-relaxed"
          style={{ background: "#E8F5EE" }}
        >
          {msg.content}
        </div>
      </div>
    );
  }
  if (msg.role === "system-error") {
    return (
      <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded p-2">
        {msg.content}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start max-w-[92%]">
      <div className="text-sm px-3 py-2 rounded-lg border border-border bg-background whitespace-pre-wrap leading-relaxed">
        {msg.content}
      </div>
      <div className="flex items-center gap-3 mt-1 px-1 text-[10px] text-muted-foreground">
        {msg.latency != null && <span>{msg.latency}ms</span>}
        {msg.cost != null && <span>${msg.cost.toFixed(4)}</span>}
        {onViewPrompt && (
          <button onClick={onViewPrompt} className="text-primary hover:underline">
            View prompt sent
          </button>
        )}
      </div>
    </div>
  );
}

function PromptBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        {label}
      </div>
      <pre
        className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap p-4 rounded border border-border max-h-[50vh] overflow-auto"
        style={{ background: "#F5F7F6" }}
      >
        {content}
      </pre>
    </div>
  );
}

export function ChatToggleButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3 h-9 rounded border border-border bg-background hover:bg-muted/60 text-xs font-medium transition-colors relative"
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
        <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H6l-3 3v-3H3a1 1 0 01-1-1V3z" />
      </svg>
      Ask the assistant
      {!open && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
      )}
    </button>
  );
}
