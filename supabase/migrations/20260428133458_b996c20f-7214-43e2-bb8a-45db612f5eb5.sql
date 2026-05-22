-- batch_runs table
create table if not exists batch_runs (
  id uuid primary key default uuid_generate_v4(),
  started_at timestamptz not null,
  completed_at timestamptz,
  sources_scanned int not null,
  candidate_events int not null,
  alerts_produced int not null,
  alerts_suppressed int not null,
  tier1_count int default 0,
  tier2_count int default 0,
  tier3_count int default 0,
  status text default 'completed',
  notes text,
  created_at timestamptz default now()
);

create index if not exists batch_runs_started_at_idx on batch_runs(started_at desc);

alter table batch_runs enable row level security;
drop policy if exists "Public read batch_runs" on batch_runs;
create policy "Public read batch_runs" on batch_runs for select using (true);

alter table alerts
  add column if not exists status text default 'pending'
    check (status in ('pending', 'approved', 'edited', 'rejected', 'sent')),
  add column if not exists reviewer_name text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists edited_advisor_message text,
  add column if not exists rejection_reason text;

create index if not exists alerts_status_idx on alerts(status);

create or replace view v_alert_queue as
select
  a.id as alert_id, a.tier, a.status, a.ir_summary, a.ir_action,
  a.advisor_message, a.classification_reason, a.time_pressure,
  e.confidence,
  e.id as event_id, e.event_date, e.headline, e.category, e.subtype,
  e.source_publisher, e.raw_summary,
  f.id as fund_id, f.ticker, f.name as fund_name, f.asset_class, f.pilot,
  m.name as manager_name
from alerts a
join events e on e.id = a.event_id
left join funds f on f.id = e.fund_id
left join managers m on m.id = coalesce(e.manager_id, f.manager_id)
where a.status = 'pending'
order by a.tier asc, e.event_date desc;

create or replace view v_recently_actioned as
select
  a.id as alert_id, a.tier, a.status, a.reviewer_name, a.reviewed_at,
  a.edited_advisor_message, a.rejection_reason,
  a.advisor_message as original_advisor_message,
  e.headline, e.event_date, f.ticker, f.name as fund_name
from alerts a
join events e on e.id = a.event_id
left join funds f on f.id = e.fund_id
where a.status in ('approved', 'edited', 'rejected', 'sent')
  and a.reviewed_at is not null
order by a.reviewed_at desc
limit 10;

insert into batch_runs (started_at, completed_at, sources_scanned, candidate_events, alerts_produced, alerts_suppressed, tier1_count, tier2_count, tier3_count)
values
  (now() - interval '13 days' + time '06:00', now() - interval '13 days' + time '06:08', 247, 38,  4, 34, 1, 2, 1),
  (now() - interval '12 days' + time '06:00', now() - interval '12 days' + time '06:07', 231, 42,  5, 37, 0, 3, 2),
  (now() - interval '11 days' + time '06:00', now() - interval '11 days' + time '06:09', 268, 51,  7, 44, 2, 3, 2),
  (now() - interval '10 days' + time '06:00', now() - interval '10 days' + time '06:08', 254, 35,  3, 32, 0, 1, 2),
  (now() - interval  '9 days' + time '06:00', now() - interval  '9 days' + time '06:07', 219, 29,  2, 27, 0, 1, 1),
  (now() - interval  '8 days' + time '06:00', now() - interval  '8 days' + time '06:08', 245, 44,  6, 38, 1, 3, 2),
  (now() - interval  '7 days' + time '06:00', now() - interval  '7 days' + time '06:09', 273, 49,  5, 44, 1, 2, 2),
  (now() - interval  '6 days' + time '06:00', now() - interval  '6 days' + time '06:07', 238, 33,  3, 30, 0, 2, 1),
  (now() - interval  '5 days' + time '06:00', now() - interval  '5 days' + time '06:08', 251, 41,  4, 37, 1, 1, 2),
  (now() - interval  '4 days' + time '06:00', now() - interval  '4 days' + time '06:07', 264, 47,  6, 41, 1, 3, 2),
  (now() - interval  '3 days' + time '06:00', now() - interval  '3 days' + time '06:08', 242, 36,  4, 32, 0, 2, 2),
  (now() - interval  '2 days' + time '06:00', now() - interval  '2 days' + time '06:09', 256, 43,  5, 38, 1, 2, 2),
  (now() - interval  '1 days' + time '06:00', now() - interval  '1 days' + time '06:07', 229, 31,  3, 28, 0, 1, 2),
  (now() - interval  '0 days' + time '06:00', now() - interval  '0 days' + time '06:08', 247, 41,  6, 35, 2, 3, 1);

update alerts set status = 'approved', reviewer_name = 'Sarah Chen, Senior Analyst', reviewed_at = '2026-01-28 09:42:00-05'
where event_id in (select id from events where headline like 'Will Danoff%');

update alerts set status = 'edited', reviewer_name = 'Marcus Webb, Compliance Lead', reviewed_at = '2026-02-26 11:15:00-05',
    edited_advisor_message = 'Vanguard has resolved a multi-state attorneys general matter related to its ESG and proxy voting practices through a $29.5M settlement, with no admission of wrongdoing. The settlement is at the parent-firm level and does not affect the management, mandate, or operations of the Vanguard funds in your portfolio. We have no recommended changes at this time and will continue to monitor.'
where event_id in (select id from events where headline like 'Vanguard agrees%');

update alerts set status = 'approved', reviewer_name = 'Sarah Chen, Senior Analyst', reviewed_at = '2025-10-03 14:20:00-04'
where event_id in (select id from events where headline like 'T. Rowe Price New Horizons%');

update alerts set status = 'approved', reviewer_name = 'David Park, Research Analyst', reviewed_at = '2025-07-15 10:30:00-04'
where event_id in (select id from events where headline like 'Oakmark International%');

update alerts set status = 'approved', reviewer_name = 'Sarah Chen, Senior Analyst', reviewed_at = '2025-09-22 16:05:00-04'
where event_id in (select id from events where headline like 'Parnassus Mid Cap%');

update alerts set status = 'rejected', reviewer_name = 'David Park, Research Analyst', reviewed_at = '2026-02-12 08:50:00-05',
    rejection_reason = 'Routine quarterly commentary — no material change to strategy, team, or fees. Tier 3 classification correct; no action warranted.'
where event_id in (select id from events where headline like 'PIMCO Income Fund Q1 2026%');

with f as (select id from funds where ticker='PIMIX'),
     m as (select id from managers where name='PIMCO'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_publisher, source_url, raw_summary, confidence)
       select f.id, m.id, current_date, 'regulatory', 'sec_inquiry',
              'SEC opens inquiry into private credit disclosure practices at major fixed income managers',
              'Wall Street Journal', 'https://example.com/sec-private-credit-inquiry',
              'The SEC has opened a non-public inquiry into disclosure practices around private credit allocations at several major multi-sector fixed income managers, including PIMCO. The inquiry focuses on how private credit exposure is communicated to investors in flagship funds. PIMCO confirmed receipt and is cooperating. No findings or charges have been issued.',
              0.94
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure, status)
select ev.id, 1,
       'Regulatory inquiry naming the manager of a flagship pilot fund. Reputationally sensitive; high client-question probability.',
       'The SEC has opened a non-public inquiry into private credit disclosure practices at PIMCO and other multi-sector fixed income managers. PIMCO is cooperating; no findings or charges have been issued. Affects parent-firm disclosure practices, not fund mandate.',
       'Compliance and IR review within 24 hours. Determine whether to issue Day-One Q&A document or wait for additional information. Confirm position on PIMCO Income remains appropriate pending resolution.',
       'PIMCO has confirmed it is cooperating with a non-public SEC inquiry related to industry-wide private credit disclosure practices. No findings or charges have been issued. The inquiry does not affect the management or mandate of PIMCO Income, and we are maintaining our current position. We will provide updates as new information becomes available.',
       'High — same-day press coverage anticipated; prepare for client questions within 24 hours.',
       'pending'
from ev;

with f as (select id from funds where ticker='FCNTX'),
     m as (select id from managers where name='Fidelity Investments'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_publisher, source_url, raw_summary, confidence)
       select f.id, m.id, current_date - 1, 'manager', 'co_pm_responsibility_expansion',
              'Fidelity Contrafund: Anolic and Weiner now manage 50% of portfolio assets ahead of Danoff retirement',
              'Morningstar', 'https://example.com/contrafund-allocation-update',
              'Per Fidelity''s latest disclosure, co-managers Asher Anolic and Jason Weiner now manage approximately 50% of Fidelity Contrafund assets — up from 30% in November 2025. The reallocation is an expected step in the previously announced succession ahead of Will Danoff''s retirement at year-end 2026. No change to investment process or strategy.',
              0.96
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure, status)
select ev.id, 2,
       'Continuation of previously-disclosed succession. No surprise; expected progression. Watch-list designation already in place from Jan 2026 alert.',
       'Anolic and Weiner now run ~50% of Contrafund assets, up from ~30% in late 2025. This is a planned progression in the disclosed Danoff succession. No process or strategy changes.',
       'Document in fund file. No additional IR action required beyond the existing watch-list designation. Add to Q1 2026 quarterly update.',
       'No fresh advisor message required — this is a planned step in the previously communicated succession. Reference the Jan 28 advisor memo if clients ask.',
       'Low — expected progression of disclosed succession.',
       'pending'
from ev;

with f as (select id from funds where ticker='OAKEX'),
     m as (select id from managers where name='Harris Associates / Oakmark'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_publisher, source_url, raw_summary, confidence)
       select f.id, m.id, current_date - 2, 'performance', 'routine_commentary',
              'Harris Associates Q1 2026 international markets commentary',
              'Harris Associates', 'https://example.com/harris-q1-2026-commentary',
              'Harris Associates published its Q1 2026 international markets outlook, discussing valuation dispersion and themes around small-cap value. No material change to strategy, team, or fees on Oakmark International Small Cap.',
              0.91
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure, status)
select ev.id, 3,
       'Routine manager commentary. No material change. Logged for context — should be suppressed from active queue.',
       'Harris Associates published a quarterly international commentary. No material change to Oakmark International Small Cap.',
       'No action. Logged for IR reference. Should be suppressed from review queue in next batch tuning.',
       'No advisor message — routine commentary.',
       'None.',
       'pending'
from ev;

with f as (select id from funds where ticker='AGTHX'),
     m as (select id from managers where name='Capital Group / American Funds'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_publisher, source_url, raw_summary, confidence)
       select f.id, m.id, current_date, 'corporate', 'leadership_change',
              'American Funds names new Head of Equity Research effective Q3 2026',
              'American Funds', 'https://example.com/american-funds-equity-head',
              'Capital Group announced that its Head of Equity Research will retire effective end of Q2 2026. A successor with 22 years tenure at the firm has been named. No PM-level changes on any specific fund. Affects research framework that supports multiple equity strategies including Growth Fund of America.',
              0.93
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure, status)
select ev.id, 2,
       'Firm-level leadership change at parent. No direct fund-level PM impact, but affects research framework supporting multiple approved-list funds.',
       'Capital Group''s Head of Equity Research will retire end of Q2 2026; internal successor named. No fund-level PM changes. Affects research support for Growth Fund of America among others.',
       'Document in firm file. Monitor for downstream PM or analyst changes over next two quarters. No immediate fund-level action needed.',
       'No proactive advisor message recommended at this time. If clients raise it, characterize as a planned, internal succession with no impact on fund management.',
       'Medium — pre-announced, internal succession.',
       'pending'
from ev;