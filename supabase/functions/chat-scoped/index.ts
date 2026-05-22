// =========================================================================
// Supabase Edge Function: chat-scoped
//
// Purpose: scoped Q&A about what's currently visible on the page. Two
// scopes supported:
//   • 'daily_operations' — alert queue, recently actioned, batch run stats
//   • 'inspect_events' — a specific event with its alert, governance, prompts
//
// Behavior: model is constrained to answering ONLY about the visible data.
// If asked something outside scope, it explains the limit and suggests
// in-scope alternatives. Every interaction is logged to chat_messages.
//
// Setup (assumes ANTHROPIC_API_KEY already set from simulate-event):
//   supabase functions deploy chat-scoped
//
// Frontend invocation:
//   const { data, error } = await supabase.functions.invoke('chat-scoped', {
//     body: {
//       session_id: existingSessionId || null,  // null = new session
//       scope: 'daily_operations',              // or 'inspect_events'
//       scope_context: { ... },                 // visible data snapshot
//       message: 'What's the highest-priority alert in the queue?'
//     }
//   })
// =========================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROMPT_VERSION = "chat-v1.0";
const MODEL = "claude-sonnet-4-6";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT_BASE = `You are a research assistant embedded in an investment-research market-event monitoring system used by a US wealth management firm. You help senior research analysts reason through their alert queue and through individual events.

CRITICAL CONSTRAINTS:
1. You answer ONLY questions about the data provided in the "VISIBLE CONTEXT" section of each user message. If the analyst asks about something not in that context, you politely explain that you can only see what they're looking at, and suggest a question you CAN answer from the visible data.
2. You do NOT take actions. You cannot approve, edit, or reject alerts. If asked to do so, explain that the analyst takes those actions through the UI; you can only help them think.
3. You do NOT speculate about events outside the visible data, predict markets, or give investment advice.
4. You do NOT invent facts. If the visible context doesn't support an answer, say so.
5. You do NOT compare against external information you might know. Only reason about what's in the visible context.

TONE:
- Concise. The analyst is busy.
- Specific. Reference the actual fund names, tier numbers, and dates from the context.
- Honest about uncertainty. If the data is ambiguous, say so.
- Plain prose. No bullet points unless the question genuinely calls for a list.

When the analyst asks "why" or "should I" type questions about a specific alert, walk them through the relevant facts from the context (tier, source, guardrails fired, what actually happened on similar past events) and let them draw the conclusion.`;

function buildScopedSystemPrompt(scope: string): string {
  if (scope === "daily_operations") {
    return SYSTEM_PROMPT_BASE + `

CURRENT SCOPE: Daily operations view.
The analyst is looking at: today's batch run statistics, the pending alert queue, and the recently-actioned alerts. You can help them reason about prioritization, patterns across the queue, why specific alerts were classified as they were, and how to think about the human review decisions ahead of them.`;
  }
  if (scope === "inspect_events") {
    return SYSTEM_PROMPT_BASE + `

CURRENT SCOPE: Inspect events view.
The analyst is looking at a specific event with its alert, governance trail, and (if a live run was performed) the prompts that drove the model. You can help them reason about why the event was classified the way it was, what the guardrails caught or missed, how the model arrived at its tiering decision, and how this event compares to similar past events visible in the context.`;
  }
  return SYSTEM_PROMPT_BASE;
}

function formatScopeContext(scope: string, context: any): string {
  // Compact JSON-ish summary; the model handles structured data well.
  const lines: string[] = [];
  lines.push("VISIBLE CONTEXT:");
  lines.push(JSON.stringify(context, null, 2));
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { session_id, scope, scope_context, message, reviewer_name } = body;

    if (!scope || !message) {
      return new Response(
        JSON.stringify({ error: "scope and message are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get or create session
    let sessionId = session_id;
    if (!sessionId) {
      const { data: newSession, error: sessionErr } = await supabase
        .from("chat_sessions")
        .insert({
          scope,
          scope_context,
          reviewer_name: reviewer_name || "Demo User, Senior Analyst",
        })
        .select("id")
        .single();
      if (sessionErr) throw sessionErr;
      sessionId = newSession.id;
    }

    // 2. Load prior messages in the session for conversation history
    const { data: priorMsgs } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    // 3. Log the user message
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "user",
      content: message,
    });

    // 4. Build the prompt
    const systemPrompt = buildScopedSystemPrompt(scope);
    const contextBlock = formatScopeContext(scope, scope_context);
    const userMessageWithContext = `${contextBlock}\n\nANALYST QUESTION:\n${message}`;

    const messages = [
      ...(priorMsgs || []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessageWithContext },
    ];

    // 5. Call Claude
    const startTime = Date.now();
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    const latency_ms = Date.now() - startTime;

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return new Response(
        JSON.stringify({ error: "Claude API error", detail: errText }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeRes.json();
    const assistantText = claudeData.content?.[0]?.text || "";
    const usage = claudeData.usage || {};

    // Cost approximation (Sonnet pricing): $3/MTok input, $15/MTok output
    const cost_usd =
      (usage.input_tokens || 0) * 0.000003 +
      (usage.output_tokens || 0) * 0.000015;

    // 6. Log the assistant message
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: assistantText,
      model_version: MODEL,
      prompt_version: PROMPT_VERSION,
      system_prompt: systemPrompt,
      user_prompt: userMessageWithContext,
      raw_response: claudeData,
      latency_ms,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cost_usd,
    });

    // 7. Update session activity
    await supabase
      .from("chat_sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", sessionId);

    return new Response(
      JSON.stringify({
        session_id: sessionId,
        message: assistantText,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        latency_ms,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
