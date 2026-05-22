-- Schema
create extension if not exists "uuid-ossp";

create table managers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  parent text,
  hq_city text,
  notes text,
  created_at timestamptz default now()
);

create table funds (
  id uuid primary key default uuid_generate_v4(),
  ticker text unique,
  name text not null,
  manager_id uuid references managers(id) on delete restrict,
  asset_class text not null,
  category text,
  aum_usd_billions numeric,
  named_pms text[],
  benchmark text,
  pilot boolean default false,
  approved_list boolean default true,
  notes text,
  created_at timestamptz default now()
);

create table events (
  id uuid primary key default uuid_generate_v4(),
  fund_id uuid references funds(id) on delete cascade,
  manager_id uuid references managers(id) on delete cascade,
  event_date date not null,
  category text not null,
  subtype text,
  headline text not null,
  source_url text,
  source_publisher text,
  raw_summary text,
  confidence numeric default 0.95,
  created_at timestamptz default now()
);

create table alerts (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references events(id) on delete cascade unique,
  tier int not null check (tier in (1,2,3)),
  classification_reason text,
  ir_summary text not null,
  ir_action text not null,
  advisor_message text not null,
  time_pressure text,
  llm_model text default 'pre-computed',
  generated_at timestamptz default now()
);

create table ir_actions (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references events(id) on delete cascade,
  action_taken text not null,
  action_date date,
  outcome text,
  documented_by text,
  created_at timestamptz default now()
);

create index events_fund_id_idx on events(fund_id);
create index events_event_date_idx on events(event_date desc);
create index alerts_event_id_idx on alerts(event_id);
create index ir_actions_event_id_idx on ir_actions(event_id);

create or replace view v_event_feed as
select
  e.id as event_id, e.event_date, e.category, e.subtype, e.headline,
  e.source_publisher, e.source_url, e.raw_summary, e.confidence,
  f.id as fund_id, f.ticker, f.name as fund_name, f.asset_class, f.pilot,
  m.name as manager_name,
  a.tier, a.ir_summary, a.ir_action, a.advisor_message, a.time_pressure, a.classification_reason
from events e
left join funds f on f.id = e.fund_id
left join managers m on m.id = coalesce(e.manager_id, f.manager_id)
left join alerts a on a.event_id = e.id;

-- Enable RLS with public read (reference/demo data, no PII)
alter table managers enable row level security;
alter table funds enable row level security;
alter table events enable row level security;
alter table alerts enable row level security;
alter table ir_actions enable row level security;

create policy "Public read managers" on managers for select using (true);
create policy "Public read funds" on funds for select using (true);
create policy "Public read events" on events for select using (true);
create policy "Public read alerts" on alerts for select using (true);
create policy "Public read ir_actions" on ir_actions for select using (true);

-- Seed: managers
insert into managers (name, parent, hq_city) values
  ('Fidelity Investments', 'FMR LLC', 'Boston, MA'),
  ('PIMCO', 'Allianz SE', 'Newport Beach, CA'),
  ('Vanguard', null, 'Malvern, PA'),
  ('BlackRock', null, 'New York, NY'),
  ('T. Rowe Price', null, 'Baltimore, MD'),
  ('Capital Group / American Funds', null, 'Los Angeles, CA'),
  ('Harris Associates / Oakmark', 'Natixis IM', 'Chicago, IL'),
  ('Parnassus Investments', null, 'San Francisco, CA'),
  ('Causeway Capital Management', null, 'Los Angeles, CA'),
  ('Dodge & Cox', null, 'San Francisco, CA'),
  ('DoubleLine Capital', null, 'Tampa, FL'),
  ('JPMorgan Asset Management', 'JPMorgan Chase', 'New York, NY');

-- Seed: funds
insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'FCNTX', 'Fidelity Contrafund', id, 'us_equity_active', 'Large Growth', 176, ARRAY['Will Danoff','Jason Weiner','Asher Anolic'], 'S&P 500', true
from managers where name = 'Fidelity Investments';

insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'PIMIX', 'PIMCO Income Fund', id, 'core_plus_fixed_income', 'Multisector Bond', 200, ARRAY['Daniel Ivascyn','Alfred Murata','Joshua Anderson'], 'Bloomberg US Aggregate', true
from managers where name = 'PIMCO';

insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'OAKEX', 'Oakmark International Small Cap', id, 'intl_equity', 'Foreign Small/Mid Value', 2.1, ARRAY['David Herro','Justin Hance'], 'MSCI World ex-US Small Cap', false
from managers where name = 'Harris Associates / Oakmark';

insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'PRNHX', 'T. Rowe Price New Horizons', id, 'us_equity_active', 'Small Growth', 24, ARRAY['Shaun Currie'], 'Russell 2000 Growth', false
from managers where name = 'T. Rowe Price';

insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'PARMX', 'Parnassus Mid Cap', id, 'us_equity_active', 'Mid-Cap Blend', 8, ARRAY['Lori Keith','Ian Sexsmith'], 'Russell Midcap', false
from managers where name = 'Parnassus Investments';

insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'VFIAX', 'Vanguard 500 Index', id, 'us_equity_passive', 'Large Blend', 1100, ARRAY[]::text[], 'S&P 500', false
from managers where name = 'Vanguard';

insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'AGTHX', 'American Funds Growth Fund of America', id, 'us_equity_active', 'Large Growth', 280, ARRAY['Donnalisa Barnum','Carl Kawaja','Martin Romo'], 'S&P 500', false
from managers where name = 'Capital Group / American Funds';

insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'CGEFX', 'Causeway Global Value', id, 'intl_equity', 'World Large Value', 2.5, ARRAY['Sarah Ketterer','Harry Hartford'], 'MSCI World', false
from managers where name = 'Causeway Capital Management';

insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'DODIX', 'Dodge & Cox Income', id, 'core_fixed_income', 'Intermediate Core-Plus Bond', 90, ARRAY['Dana Emery','Thomas Dugan'], 'Bloomberg US Aggregate', false
from managers where name = 'Dodge & Cox';

insert into funds (ticker, name, manager_id, asset_class, category, aum_usd_billions, named_pms, benchmark, pilot)
select 'DBLTX', 'DoubleLine Total Return Bond', id, 'core_fixed_income', 'Intermediate Core Bond', 45, ARRAY['Jeffrey Gundlach','Andrew Hsu','Ken Shinoda'], 'Bloomberg US Aggregate', false
from managers where name = 'DoubleLine Capital';

-- EVENT 1
with f as (select id from funds where ticker='FCNTX'),
     m as (select id from managers where name='Fidelity Investments'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_url, source_publisher, raw_summary, confidence)
       select f.id, m.id, '2026-01-27', 'manager', 'lead_pm_departure',
              'Will Danoff to retire as Fidelity Contrafund lead manager at end of 2026',
              'https://www.morningstar.com/funds/fidelity-contrafunds-will-danoff-retire',
              'Morningstar',
              'Fidelity announced that Will Danoff, who has managed Contrafund since 1990, will retire as lead manager at the end of 2026. Co-managers Jason Weiner and Asher Anolic — added to the lineup in April 2025 — will assume full control. Morningstar Medalist Rating placed Under Review. Approximately 30% of the portfolio has already been reallocated under the co-managers between April and November 2025.',
              0.99
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure)
select ev.id, 1,
       'Lead PM departure on a flagship fund with $176B AUM. Highest priority — covered by Reuters, Bloomberg, Morningstar same day.',
       'Will Danoff (35-year tenure) will retire from Fidelity Contrafund at year-end 2026. Co-managers Anolic and Weiner — already running ~30% of the portfolio — assume full control. Morningstar rating placed Under Review.',
       'Convene Investment Committee review within 5 business days. Assess succession quality (co-managers already named, with overlap period). Reaffirm or revise approved-list status. Draft advisor talking points within 48 hours.',
       'Mr. Danoff''s retirement was long anticipated and Fidelity has executed a textbook succession — Weiner and Anolic have been running a meaningful share of the portfolio since April 2025. Our current view is to maintain the position while we monitor the transition. We will provide an updated view following the Investment Committee review.',
       'High — same-day press coverage across Reuters, Bloomberg, Morningstar, Boston Globe.'
from ev;

insert into ir_actions (event_id, action_taken, action_date, outcome, documented_by)
select e.id, 'Convened Investment Committee review on Jan 30, 2026. Issued advisor memo Jan 31. Maintained approved-list status with watch designation through 2026.',
       '2026-01-31', 'Position retained; quarterly review scheduled for Q2 2026', 'Investment Research'
from events e where e.headline like 'Will Danoff%';

-- EVENT 2
with f as (select id from funds where ticker='VFIAX'),
     m as (select id from managers where name='Vanguard'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_url, source_publisher, raw_summary, confidence)
       select f.id, m.id, '2026-02-25', 'regulatory', 'state_ag_settlement',
              'Vanguard agrees to $29.5M settlement with 13 state attorneys general over ESG claims',
              'https://www.morganlewis.com/pubs/2026/03/securities-enforcement-roundup-february-2026',
              'Morgan Lewis Securities Enforcement Roundup',
              'Vanguard Group, Inc. entered a settlement with the attorneys general of 13 states (led by Texas) related to ESG-linked claims tied to coal investments and proxy-voting practices. Settlement amount: $29.5 million. Does not include admission of wrongdoing. Affects parent firm, not specific to any single fund.',
              0.97
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure)
select ev.id, 1,
       'Settlement with 13 state AGs is politically and reputationally sensitive. Affects parent firm; advisors will receive client questions within hours.',
       'Vanguard agreed to a $29.5M settlement with 13 state AGs over ESG-related claims. No admission of wrongdoing. Action is at the parent-firm level and does not directly affect fund mandates or operations.',
       'Compliance + IR review within 48 hours. Determine whether any approved-list Vanguard funds require re-underwriting. Issue Day-One Q&A document for advisor calls.',
       'Vanguard has resolved a multi-state attorneys general matter related to ESG and proxy voting through a $29.5M settlement, with no admission of wrongdoing. The settlement is at the parent-firm level and does not change the management or mandate of the Vanguard funds we use. We will continue to monitor and update if our view changes.',
       'Very high — politically sensitive, expect client questions within 24 hours.'
from ev;

insert into ir_actions (event_id, action_taken, action_date, outcome, documented_by)
select e.id, 'Compliance review completed Feb 26. Q&A document distributed to advisors Feb 27. No changes to approved-list status.',
       '2026-02-27', 'Position retained across all Vanguard funds; Q&A doc archived', 'Compliance'
from events e where e.headline like 'Vanguard agrees%';

-- EVENT 3
with f as (select id from funds where ticker='PRNHX'),
     m as (select id from managers where name='T. Rowe Price'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_url, source_publisher, raw_summary, confidence)
       select f.id, m.id, '2025-09-30', 'manager', 'lead_pm_departure',
              'T. Rowe Price New Horizons: Josh Spencer exits, Shaun Currie assumes lead PM',
              'https://www.morningstar.com/funds/4-funds-with-rating-changes-after-manager-departures',
              'Morningstar',
              'Josh Spencer, lead PM of T. Rowe Price New Horizons (PRNHX) since 2019, exited September 30, 2025. Shaun Currie — who joined Spencer in July 2025 — takes over as lead. Fund had underperformed Russell 2000 Growth Index since mid-2021. Brief overlap period between July and September.',
              0.98
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure)
select ev.id, 1,
       'Lead PM departure on an actively held small-growth fund. Limited overlap (~3 months) with successor.',
       'Josh Spencer departed T. Rowe Price New Horizons on 9/30/2025 after underperformance vs. Russell 2000 Growth since mid-2021. Shaun Currie assumed lead duties after a 3-month overlap.',
       'Investment Committee review within 5 business days. Underperformance pre-dating the change suggests a process review is warranted. Consider watch-list designation pending Currie''s first two quarters.',
       'T. Rowe Price has transitioned lead management of New Horizons to Shaun Currie, who worked alongside Josh Spencer for the prior quarter. Given the fund''s recent performance, we are placing the position on watch and will reassess after two full quarters under the new leadership.',
       'Medium — pre-announced, but performance backdrop adds urgency.'
from ev;

insert into ir_actions (event_id, action_taken, action_date, outcome, documented_by)
select e.id, 'Watch-list designation issued Oct 3, 2025. Reassessment scheduled for end of Q1 2026.',
       '2025-10-03', 'Watch-list status active', 'Investment Research'
from events e where e.headline like 'T. Rowe Price New Horizons%';

-- EVENT 4
with f as (select id from funds where ticker='OAKEX'),
     m as (select id from managers where name='Harris Associates / Oakmark'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_url, source_publisher, raw_summary, confidence)
       select f.id, m.id, '2025-07-01', 'manager', 'co_pm_departure',
              'Oakmark International Small Cap: co-PM Michael Manelli steps down',
              'https://www.morningstar.com/funds/4-funds-with-rating-changes-after-manager-departures',
              'Morningstar',
              'Michael Manelli, co-PM of Oakmark International Small Cap since 2011, stepped down July 1, 2025 and later retired from Harris Associates. Manelli had been central to the strategy''s success. Morningstar People rating downgraded from High to Above Average. David Herro remains on the fund; Justin Hance assumes more responsibilities.',
              0.97
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure)
select ev.id, 2,
       'Co-PM departure with Morningstar rating downgrade. Lead PM (Herro) remains in place.',
       'Michael Manelli stepped down as co-PM of Oakmark International Small Cap on 7/1/2025. Morningstar People rating downgraded High → Above Average. David Herro remains; Justin Hance assumes expanded role.',
       'Qualitative review of Hance''s readiness for expanded responsibilities. Update internal People rating. No immediate advisor-facing communication needed unless additional departures follow.',
       'No advisor message issued — Tier 2 internal review only.',
       'Medium — covered by Morningstar but not in mainstream financial press.'
from ev;

insert into ir_actions (event_id, action_taken, action_date, outcome, documented_by)
select e.id, 'Internal note added to fund file. No advisor-facing communication. Quarterly review scheduled.',
       '2025-07-15', 'No change to approved-list status', 'Investment Research'
from events e where e.headline like 'Oakmark International%';

-- EVENT 5
with f as (select id from funds where ticker='PARMX'),
     m as (select id from managers where name='Parnassus Investments'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_url, source_publisher, raw_summary, confidence)
       select f.id, m.id, '2025-09-16', 'manager', 'lead_pm_departure',
              'Parnassus Mid Cap: lead PM Matthew Gershuny departs after 17 years',
              'https://www.morningstar.com/funds/4-funds-with-rating-changes-after-manager-departures',
              'Morningstar',
              'Matthew Gershuny departed Parnassus on Sept 16, 2025 after leading Parnassus Mid Cap for 17 years. Three experienced analysts also departed in recent years. Morningstar People rating downgraded Above Average → Average. Lori Keith and Ian Sexsmith remain.',
              0.96
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure)
select ev.id, 1,
       'Lead PM departure plus analyst-team attrition. Compounded risk; rating downgrade.',
       'Matthew Gershuny departed Parnassus Mid Cap after 17 years as lead. Three analysts also left in recent years. Morningstar People rating downgraded to Average. Remaining team carries heavier load.',
       'Investment Committee review within 5 business days. Bench-strength assessment is the central question. Consider replacement on approved list.',
       'Parnassus Mid Cap has experienced a leadership change with the departure of long-tenured PM Matthew Gershuny. Combined with analyst departures, this raises questions about the bench strength supporting the strategy. We are reviewing the fund and will issue a recommendation within two weeks.',
       'Medium-high — covered by Morningstar; advisor-facing implications likely.'
from ev;

insert into ir_actions (event_id, action_taken, action_date, outcome, documented_by)
select e.id, 'IC review held Sept 22. Replacement candidate identified. Decision: phase out over Q4 2025.',
       '2025-09-22', 'Removed from approved list Dec 1, 2025', 'Investment Research'
from events e where e.headline like 'Parnassus Mid Cap%';

-- EVENT 6
with f as (select id from funds where ticker='PIMIX'),
     m as (select id from managers where name='PIMCO'),
     ev as (
       insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_url, source_publisher, raw_summary, confidence)
       select f.id, m.id, '2026-02-11', 'performance', 'routine_commentary',
              'PIMCO Income Fund Q1 2026 update: positioning for active fixed income',
              'https://www.pimco.com/us/en/insights/income-fund-update-standout-returns-powered-by-active-management',
              'PIMCO',
              'Routine quarterly investment commentary from Dan Ivascyn and team on PIMCO Income Fund positioning. No material change to strategy, team, or fees. Discussion of duration, credit quality, and global divergence themes.',
              0.92
       from f, m returning id
     )
insert into alerts (event_id, tier, classification_reason, ir_summary, ir_action, advisor_message, time_pressure)
select ev.id, 3,
       'Routine manager commentary. No material change. Suppressed from active alerting — logged for context only.',
       'PIMCO Income team published Q1 2026 commentary. No material change to strategy, team, or fees.',
       'No action required. Logged for IR reference.',
       'No advisor message — routine commentary only.',
       'None'
from ev;

-- EVENT 7
with m as (select id from managers where name='Vanguard')
insert into events (fund_id, manager_id, event_date, category, subtype, headline, source_publisher, source_url, raw_summary, confidence)
select null, m.id, '2026-04-15', 'operations', 'sub_advisor_change',
       'Industry comparable: CIBC GAM sub-advisory reallocations across multiple funds',
       'CIBC',
       'https://cibc.mediaroom.com/2026-04-15-CIBC-Global-Asset-Management-announces-portfolio-sub-advisory-changes-to-certain-funds',
       'Industry-comparable event: CIBC GAM announced sub-advisory reallocations effective May 15, 2026. Demonstrates the operations event category. No direct approved-list impact, but a useful pattern for the system to recognize.',
       0.85
from m;