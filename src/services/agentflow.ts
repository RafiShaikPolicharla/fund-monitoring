export interface AgentflowResult {
  text: string;
  sessionId?: string;
  requestId?: string;
}

interface AgentflowOptions {
  signal?: AbortSignal;
  onText?: (text: string) => void;
}

function extractText(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const messages = Array.isArray(record.messages) ? record.messages : null;

  if (messages) {
    return messages
      .map((message) => {
        if (!message || typeof message !== "object") return "";
        const content = (message as Record<string, unknown>).content;
        return typeof content === "string" ? content.trim() : "";
      })
      .filter(Boolean);
  }

  return Object.values(record).flatMap(extractText);
}

function parseSseEvent(raw: string): unknown | null {
  const payload = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!payload || payload === "[DONE]") return null;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function readEvent(raw: string): { text: string; isLastNode: boolean; sessionId?: string; requestId?: string } | null {
  const parsed = parseSseEvent(raw);
  if (!parsed || typeof parsed !== "object") return null;

  const event = parsed as Record<string, unknown>;
  if (typeof event.error === "string") throw new Error(event.error);

  const parts = extractText(event.response);
  return {
    text: parts.at(-1) ?? "",
    isLastNode: event.last_node === true,
    sessionId: typeof event.session_id === "string" ? event.session_id : undefined,
    requestId: typeof event.request_id === "string" ? event.request_id : undefined,
  };
}

export async function askAgentflow(query: string, options: AgentflowOptions = {}): Promise<AgentflowResult> {
  const response = await fetch("/api/agentflow", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(detail || "Agentflow request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let lastNodeText = "";
  let sessionId: string | undefined;
  let requestId: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const events = buffer.split(/\n\n+/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const parsed = readEvent(event);
      if (!parsed) continue;
      if (parsed.sessionId) sessionId = parsed.sessionId;
      if (parsed.requestId) requestId = parsed.requestId;
      if (parsed.text) text = parsed.text;
      if (parsed.isLastNode && parsed.text) lastNodeText = parsed.text;
    }

    if (done) break;
  }

  if (buffer.trim()) {
    const parsed = readEvent(buffer);
    if (parsed?.sessionId) sessionId = parsed.sessionId;
    if (parsed?.requestId) requestId = parsed.requestId;
    if (parsed?.text) text = parsed.text;
    if (parsed?.isLastNode && parsed.text) lastNodeText = parsed.text;
  }

  text = lastNodeText || text;
  if (text) options.onText?.(text);
  return { text, sessionId, requestId };
}
