// =========================================================================
// Edge Function: simulate-event
// Classifies a market event into a structured alert via Anthropic Claude.
// =========================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the alerting layer of an Investment Research market-event monitoring system used by a US wealth management firm.

You receive a market event affecting an approved-list fund and produce a structured alert. Your output is consumed by a senior research analyst, who then routes the message to financial advisors and (where appropriate) to clients.

CLASSIFY each event into one of five categories:
  - manager: PM, co-PM, analyst departures or successions
  - regulatory: SEC, state AG, compliance, proxy disputes
  - corporate: M&A, ownership change, CEO/CIO departures at parent
  - operations: fund closures, mergers, strategy changes, sub-advisor swaps, fee changes
  - performance: drawdowns, style drift, volatility, liquidity stress

ASSIGN a tier:
  - Tier 1: action required, time-sensitive (lead PM departure, regulatory action, strategy change)
  - Tier 2: review and document (co-PM departure, M&A, analyst clusters)
  - Tier 3: logged for context only (routine commentary, minor performance noise)

For each alert, produce:
  - ir_summary: 2-3 sentences. The facts a senior analyst needs to read in 15 seconds.
  - ir_action: the specific next step (IC review, compliance review, watch-list, etc.) with timeline.
  - advisor_message: 2-4 sentences a financial advisor could read to a client. Calm, factual, no speculation. If Tier 3, write "No advisor message — routine event."
  - time_pressure: one-line characterization (e.g. "High — same-day press coverage").
  - classification_reason: one sentence explaining why this category and tier.

Never invent facts not present in the source material. If the event is ambiguous, lean toward the higher tier and flag the ambiguity in classification_reason.

Output VALID JSON ONLY, no preamble, matching this exact schema:
{
  "category": "manager" | "regulatory" | "corporate" | "operations" | "performance",
  "tier": 1 | 2 | 3,
  "classification_reason": string,
  "ir_summary": string,
  "ir_action": string,
  "advisor_message": string,
  "time_pressure": string,
  "confidence": number (0-1)
}`;

const MODEL = "claude-sonnet-4-5-20250929";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { fund_id, headline, raw_summary, event_date } = body;

    if (!headline || !raw_summary) {
      return new Response(
        JSON.stringify({ error: "headline and raw_summary are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    let fundContext = "";
    if (fund_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: fund } = await supabase
        .from("funds")
        .select("ticker, name, asset_class, category, aum_usd_billions, named_pms, benchmark, managers(name)")
        .eq("id", fund_id)
        .single();

      if (fund) {
        const pms = (fund.named_pms || []).join(", ") || "(no named PMs)";
        // @ts-ignore — managers is joined object
        const mgrName = fund.managers?.name || "(unknown manager)";
        fundContext = `\nFUND CONTEXT:
  Name: ${fund.name} (${fund.ticker})
  Manager: ${mgrName}
  Asset class: ${fund.asset_class}
  Category: ${fund.category}
  AUM: $${fund.aum_usd_billions}B
  Named PMs: ${pms}
  Benchmark: ${fund.benchmark}\n`;
      }
    }

    const userPrompt = `${fundContext}
EVENT DATE: ${event_date || new Date().toISOString().split("T")[0]}
HEADLINE: ${headline}

SOURCE MATERIAL:
${raw_summary}

Produce the JSON alert now.`;

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
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return new Response(
        JSON.stringify({ error: "Claude API error", detail: errText }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || "";
    const cleaned = text.replace(/```json|```/g, "").trim();

    let alert;
    try {
      alert = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse model output as JSON", raw: text }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        alert,
        model: MODEL,
        prompts: { system: SYSTEM_PROMPT, user: userPrompt },
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
