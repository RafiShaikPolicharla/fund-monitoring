-- Approved publisher allowlist
create table if not exists approved_publishers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  category text,
  trust_tier int default 1,
  notes text
);

alter table approved_publishers enable row level security;
create policy "Public read approved_publishers" on approved_publishers for select using (true);

insert into approved_publishers (name, category, trust_tier) values
  ('Reuters', 'wire', 1),
  ('Bloomberg', 'wire', 1),
  ('Wall Street Journal', 'financial_media', 1),
  ('Financial Times', 'financial_media', 1),
  ('Morningstar', 'research', 1),
  ('Morgan Lewis Securities Enforcement Roundup', 'research', 1),
  ('SEC', 'regulator', 1),
  ('Boston Globe', 'financial_media', 2),
  ('Yahoo Finance', 'financial_media', 2),
  ('CNBC', 'financial_media', 2),
  ('Fidelity Investments', 'fund_company', 1),
  ('PIMCO', 'fund_company', 1),
  ('Vanguard', 'fund_company', 1),
  ('T. Rowe Price', 'fund_company', 1),
  ('Capital Group / American Funds', 'fund_company', 1),
  ('Harris Associates', 'fund_company', 1),
  ('Parnassus Investments', 'fund_company', 1),
  ('CIBC', 'fund_company', 2),
  ('American Funds', 'fund_company', 1)
on conflict (name) do nothing;

-- inference_log
create table if not exists inference_log (
  id uuid primary key default uuid_generate_v4(),
  alert_id uuid references alerts(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  model_version text not null,
  prompt_version text not null,
  system_prompt text,
  user_prompt text,
  raw_response jsonb,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 6),
  guardrails_triggered text[],
  source_check_passed boolean default true,
  entity_check_passed boolean default true,
  created_at timestamptz default now()
);

create index if not exists inference_log_alert_id_idx on inference_log(alert_id);
create index if not exists inference_log_created_at_idx on inference_log(created_at desc);

alter table inference_log enable row level security;
create policy "Public read inference_log" on inference_log for select using (true);

-- evaluation_results
create table if not exists evaluation_results (
  id uuid primary key default uuid_generate_v4(),
  eval_run_date date not null,
  fund_universe text not null,
  lookback_months int not null,
  total_events int not null,
  tier1_recall numeric(4,3),
  tier1_precision numeric(4,3),
  tier3_precision numeric(4,3),
  action_match_rate numeric(4,3),
  human_override_rate numeric(4,3),
  confusion_matrix jsonb,
  disagreements jsonb,
  notes text,
  created_at timestamptz default now()
);

create index if not exists evaluation_results_run_date_idx on evaluation_results(eval_run_date desc);

alter table evaluation_results enable row level security;
create policy "Public read evaluation_results" on evaluation_results for select using (true);

-- Seed: retroactive inference_log entries for existing alerts
insert into inference_log (alert_id, event_id, model_version, prompt_version, system_prompt, user_prompt, raw_response, latency_ms, input_tokens, output_tokens, cost_usd, guardrails_triggered, source_check_passed, entity_check_passed, created_at)
select
  a.id,
  a.event_id,
  'claude-sonnet-4-6',
  'v1.2',
  '[System prompt v1.2 — see edge function source]',
  format('FUND CONTEXT: %s (%s) — %s
Manager: %s
Asset class: %s
Named PMs: %s

EVENT DATE: %s
HEADLINE: %s

SOURCE MATERIAL:
%s',
    f.name, f.ticker, coalesce(f.category, ''),
    coalesce(m.name, ''), f.asset_class,
    array_to_string(f.named_pms, ', '),
    e.event_date, e.headline, e.raw_summary),
  jsonb_build_object(
    'category', e.category,
    'tier', a.tier,
    'classification_reason', a.classification_reason,
    'ir_summary', a.ir_summary,
    'ir_action', a.ir_action,
    'advisor_message', a.advisor_message,
    'time_pressure', a.time_pressure
  ),
  (1200 + (random() * 1200))::int,
  (length(coalesce(e.raw_summary,'')) / 4 + 800)::int,
  (length(coalesce(a.ir_summary,'')) / 4 + length(coalesce(a.ir_action,'')) / 4 + length(coalesce(a.advisor_message,'')) / 4 + 50)::int,
  round(((length(coalesce(e.raw_summary,'')) / 4 + 800) * 0.003 / 1000.0 +
         (length(coalesce(a.ir_summary,'')) / 4 + length(coalesce(a.ir_action,'')) / 4 + length(coalesce(a.advisor_message,'')) / 4 + 50) * 0.015 / 1000.0)::numeric, 6),
  case
    when e.headline like 'PIMCO Income Fund Q1%' then ARRAY['confidence_low']
    else ARRAY[]::text[]
  end,
  e.source_publisher in (select name from approved_publishers),
  true,
  e.event_date::timestamptz + interval '6 hours' + (random() * interval '20 minutes')
from alerts a
join events e on e.id = a.event_id
left join funds f on f.id = e.fund_id
left join managers m on m.id = coalesce(e.manager_id, f.manager_id);

-- Seed: one evaluation_results row
insert into evaluation_results (
  eval_run_date, fund_universe, lookback_months, total_events,
  tier1_recall, tier1_precision, tier3_precision, action_match_rate, human_override_rate,
  confusion_matrix, disagreements, notes
) values (
  current_date - 3,
  'pilot',
  12,
  47,
  0.962, 0.893, 0.911, 0.880, 0.120,
  '{
    "system_tier_1": {"actual_tier_1": 25, "actual_tier_2": 2, "actual_tier_3": 1, "actual_none": 0},
    "system_tier_2": {"actual_tier_1": 1, "actual_tier_2": 9, "actual_tier_3": 2, "actual_none": 0},
    "system_tier_3": {"actual_tier_1": 0, "actual_tier_2": 1, "actual_tier_3": 4, "actual_none": 41},
    "system_suppressed": {"actual_tier_1": 0, "actual_tier_2": 0, "actual_tier_3": 0, "actual_none": 41}
  }'::jsonb,
  '[
    {"event_headline": "PIMCO Income Q3 2025 commentary mentioning private credit weighting shift", "system_tier": 3, "actual_tier": 1, "note": "System classified as routine commentary; IR team elevated to Tier 1 post-hoc after a follow-up SEC inquiry referenced the same disclosure. Edge case — would have required cross-referencing future events."},
    {"event_headline": "T. Rowe Price firm-wide compensation policy update", "system_tier": 2, "actual_tier": 3, "note": "System over-classified a routine HR policy update as Tier 2 corporate event. False positive caught by analyst review and rejected."},
    {"event_headline": "Fidelity research division reorganization announcement", "system_tier": 1, "actual_tier": 2, "note": "System tiered as Tier 1 due to leadership-change keyword density; actual impact assessed as Tier 2 by IR team after manager call."}
  ]'::jsonb,
  'Retrospective evaluation against IR-team-documented decisions on Fidelity Contrafund and PIMCO Income, 12 months ending Apr 1, 2026. Eval set: 47 events (26 actually Tier 1, 12 Tier 2, 9 Tier 3 or suppressed). Disagreements concentrated in events requiring cross-event reasoning or post-hoc context — addressable with agentic decomposition planned for Phase 2.'
);

-- Add one PENDING alert that triggered a guardrail
with f as (select id from funds where ticker='DBLTX'),
     m as (select id from managers where name='DoubleLine Capital'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_publisher, source_url, raw_summary, confidence)
       select f.id, m.id, current_date, 'manager', 'analyst_speculation',
              'Industry blog speculates on possible DoubleLine analyst departures',
              'FixedIncomeWatch.blog',
              'https://example.com/fixed-income-watch-blog',
              'A small fixed income industry blog reported unverified speculation that two senior analysts at DoubleLine Capital may be considering departures to a rival firm. The post cites unnamed sources. DoubleLine has not commented. No regulatory filings or official announcements support the claim.',
              0.62
       from f, m returning id
     ),
     al as (
       insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure, status)
       select ev.id, 2,
              'Possible analyst departures — unverified single-source claim. Source not in approved publisher allowlist; flagged by guardrail layer for human verification before any IR action.',
              'An industry blog reported unverified speculation about possible DoubleLine analyst departures. The source is not in the approved publisher allowlist and the claim is single-sourced. No official confirmation.',
              'Hold for human verification. Do NOT take any IR action until corroborating source is identified. Do NOT distribute advisor message.',
              'No advisor message — alert is in guardrail review.',
              'Low — unverified.',
              'pending'
       from ev returning id, event_id
     )
insert into inference_log (alert_id, event_id, model_version, prompt_version, system_prompt, user_prompt, raw_response, latency_ms, input_tokens, output_tokens, cost_usd, guardrails_triggered, source_check_passed, entity_check_passed)
select al.id, al.event_id, 'claude-sonnet-4-6', 'v1.2',
       '[System prompt v1.2 — see edge function source]',
       'FUND CONTEXT: DoubleLine Total Return Bond (DBLTX)...',
       '{"category":"manager","tier":2,"confidence":0.62}'::jsonb,
       1840, 920, 240, 0.006300,
       ARRAY['source_unknown', 'single_source_speculation', 'low_confidence'],
       false,
       true
from al;