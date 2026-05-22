create table if not exists chat_sessions (
  id uuid primary key default uuid_generate_v4(),
  scope text not null,
  scope_context jsonb,
  reviewer_name text,
  started_at timestamptz default now(),
  last_activity_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model_version text,
  prompt_version text,
  system_prompt text,
  user_prompt text,
  raw_response jsonb,
  latency_ms int,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10, 6),
  created_at timestamptz default now()
);

create index if not exists chat_messages_session_id_idx on chat_messages(session_id, created_at);
create index if not exists chat_sessions_scope_idx on chat_sessions(scope, last_activity_at desc);

alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

create policy "Public read chat_sessions" on chat_sessions for select using (true);
create policy "Public insert chat_sessions" on chat_sessions for insert with check (true);
create policy "Public update chat_sessions" on chat_sessions for update using (true);

create policy "Public read chat_messages" on chat_messages for select using (true);
create policy "Public insert chat_messages" on chat_messages for insert with check (true);