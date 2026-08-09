-- ScopeProof 中文研究 v0.5
-- 网页只能调用带会话令牌的 RPC，不能直接读取或修改研究数据表。

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.scopeproof_sessions (
  session_id uuid primary key default extensions.gen_random_uuid(),
  token_hash bytea not null,
  participant_id text not null,
  condition text not null check (condition in ('baseline', 'scopeproof')),
  stimulus_set text not null check (stimulus_set = 'study12-zh-cn-v0.5'),
  item_order text[] not null check (array_length(item_order, 1) = 12),
  current_position smallint not null default 0 check (current_position between 0 and 12),
  status text not null default 'active' check (status in ('active', 'complete', 'withdrawn')),
  completion_code text not null unique
    default lpad(floor(random() * 1000000)::integer::text, 6, '0')
    check (completion_code ~ '^[0-9]{6}$'),
  user_agent text not null default '',
  viewport_width integer check (viewport_width between 240 and 10000),
  viewport_height integer check (viewport_height between 240 and 10000),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (participant_id, stimulus_set)
);

create table if not exists public.scopeproof_responses (
  session_id uuid not null references public.scopeproof_sessions(session_id) on delete cascade,
  item_id text not null,
  position smallint not null check (position between 0 and 11),
  response_status text not null check (response_status in ('supported', 'refuted', 'insufficient')),
  truth_probability smallint not null check (truth_probability between 0 and 100),
  truth_touched boolean not null check (truth_touched),
  confidence smallint not null check (confidence between 0 and 100),
  confidence_touched boolean not null check (confidence_touched),
  action text not null check (action in ('rely-on-claim', 'request-evidence', 'discount-claim')),
  counterfactual text not null check (counterfactual in ('capability', 'object', 'condition', 'metric_scope')),
  response_ms integer not null check (response_ms between 0 and 3600000),
  evidence_open_count smallint not null check (evidence_open_count between 0 and 100),
  event_uuid uuid not null unique,
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (session_id, item_id),
  unique (session_id, position)
);

create table if not exists public.scopeproof_events (
  event_id bigint generated always as identity primary key,
  event_uuid uuid not null unique,
  session_id uuid not null references public.scopeproof_sessions(session_id) on delete cascade,
  item_id text,
  event_type text not null check (char_length(event_type) between 1 and 60),
  elapsed_ms integer not null check (elapsed_ms between 0 and 3600000),
  payload jsonb not null default '{}'::jsonb,
  client_created_at timestamptz not null,
  received_at timestamptz not null default now()
);

alter table public.scopeproof_sessions enable row level security;
alter table public.scopeproof_responses enable row level security;
alter table public.scopeproof_events enable row level security;

revoke all on public.scopeproof_sessions from anon, authenticated;
revoke all on public.scopeproof_responses from anon, authenticated;
revoke all on public.scopeproof_events from anon, authenticated;
revoke usage, select on all sequences in schema public from anon, authenticated;

create or replace function public.create_scopeproof_session(
  p_token text,
  p_participant_id text,
  p_condition text,
  p_stimulus_set text,
  p_item_order text[],
  p_user_agent text default '',
  p_viewport_width integer default null,
  p_viewport_height integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session public.scopeproof_sessions%rowtype;
  v_allowed constant text[] := array[
    'P-S-01', 'P-S-04', 'A-S-01', 'P-R-01', 'A-R-02', 'A-R-03',
    'P-I-01', 'P-I-02', 'A-I-01', 'P-F-01', 'A-F-01', 'A-F-02'
  ];
begin
  if p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid session token'; end if;
  if p_participant_id !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'invalid participant id'; end if;
  if p_condition not in ('baseline', 'scopeproof') then raise exception 'invalid condition'; end if;
  if p_stimulus_set <> 'study12-zh-cn-v0.5' then raise exception 'invalid stimulus set'; end if;
  if array_length(p_item_order, 1) <> 12
    or (select count(distinct item) from unnest(p_item_order) as item) <> 12
    or exists (select 1 from unnest(p_item_order) as item where not (item = any(v_allowed)))
  then
    raise exception 'invalid item order';
  end if;
  if p_viewport_width not between 240 and 10000 or p_viewport_height not between 240 and 10000 then
    raise exception 'invalid viewport';
  end if;

  begin
    insert into public.scopeproof_sessions(
      token_hash, participant_id, condition, stimulus_set, item_order,
      user_agent, viewport_width, viewport_height
    ) values (
      extensions.digest(p_token, 'sha256'), p_participant_id, p_condition,
      p_stimulus_set, p_item_order, left(coalesce(p_user_agent, ''), 400),
      p_viewport_width, p_viewport_height
    ) returning * into v_session;
  exception when unique_violation then
    raise exception 'participant already used';
  end;

  insert into public.scopeproof_events(
    event_uuid, session_id, item_id, event_type, elapsed_ms, payload, client_created_at
  ) values (
    extensions.gen_random_uuid(), v_session.session_id, p_item_order[1], 'session_start', 0,
    jsonb_build_object(
      'participant_id', p_participant_id,
      'condition', p_condition,
      'stimulus_set', p_stimulus_set,
      'item_order', to_jsonb(p_item_order),
      'viewport', jsonb_build_array(p_viewport_width, p_viewport_height)
    ), now()
  );

  return jsonb_build_object(
    'session_id', v_session.session_id,
    'condition', v_session.condition,
    'stimulus_set', v_session.stimulus_set,
    'item_order', to_jsonb(v_session.item_order),
    'current_position', v_session.current_position,
    'status', v_session.status,
    'completion_code', null
  );
end;
$$;

create or replace function public.get_scopeproof_session(
  p_session_id uuid,
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_session public.scopeproof_sessions%rowtype;
begin
  select * into v_session
  from public.scopeproof_sessions
  where session_id = p_session_id
    and token_hash = extensions.digest(p_token, 'sha256');
  if not found then raise exception 'session not found'; end if;

  return jsonb_build_object(
    'session_id', v_session.session_id,
    'condition', v_session.condition,
    'stimulus_set', v_session.stimulus_set,
    'item_order', to_jsonb(v_session.item_order),
    'current_position', v_session.current_position,
    'status', v_session.status,
    'completion_code', case when v_session.status = 'complete' then v_session.completion_code else null end
  );
end;
$$;

create or replace function public.save_scopeproof_event(
  p_session_id uuid,
  p_token text,
  p_event_uuid uuid,
  p_item_id text,
  p_event_type text,
  p_elapsed_ms integer,
  p_payload jsonb,
  p_client_created_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_event_type not in ('evidence_open', 'evidence_close', 'help_open', 'help_close') then
    raise exception 'invalid event type';
  end if;
  if p_item_id not in (
    'P-S-01', 'P-S-04', 'A-S-01', 'P-R-01', 'A-R-02', 'A-R-03',
    'P-I-01', 'P-I-02', 'A-I-01', 'P-F-01', 'A-F-01', 'A-F-02'
  ) then raise exception 'invalid item'; end if;
  if p_elapsed_ms not between 0 and 3600000 then raise exception 'invalid elapsed time'; end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 8192
  then raise exception 'invalid payload'; end if;

  perform 1 from public.scopeproof_sessions
  where session_id = p_session_id
    and token_hash = extensions.digest(p_token, 'sha256')
    and status = 'active';
  if not found then raise exception 'active session not found'; end if;

  insert into public.scopeproof_events(
    event_uuid, session_id, item_id, event_type, elapsed_ms, payload, client_created_at
  ) values (
    p_event_uuid, p_session_id, p_item_id, p_event_type, p_elapsed_ms,
    coalesce(p_payload, '{}'::jsonb), p_client_created_at
  ) on conflict (event_uuid) do nothing;
  return true;
end;
$$;

create or replace function public.save_scopeproof_response(
  p_session_id uuid,
  p_token text,
  p_item_id text,
  p_position integer,
  p_response_status text,
  p_truth_probability integer,
  p_truth_touched boolean,
  p_confidence integer,
  p_confidence_touched boolean,
  p_action text,
  p_counterfactual text,
  p_response_ms integer,
  p_evidence_open_count integer,
  p_event_uuid uuid,
  p_client_created_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session public.scopeproof_sessions%rowtype;
  v_next integer;
begin
  select * into v_session
  from public.scopeproof_sessions
  where session_id = p_session_id
    and token_hash = extensions.digest(p_token, 'sha256')
  for update;
  if not found then raise exception 'session not found'; end if;

  if exists (
    select 1 from public.scopeproof_responses
    where session_id = p_session_id and event_uuid = p_event_uuid
  ) then
    return jsonb_build_object(
      'current_position', v_session.current_position,
      'status', v_session.status,
      'completion_code', case when v_session.status = 'complete' then v_session.completion_code else null end
    );
  end if;

  if v_session.status <> 'active' then raise exception 'session not active'; end if;
  if p_position <> v_session.current_position
    or v_session.item_order[p_position + 1] <> p_item_id
  then raise exception 'unexpected item position'; end if;
  if p_response_status not in ('supported', 'refuted', 'insufficient') then raise exception 'invalid response status'; end if;
  if p_truth_probability not between 0 and 100 or p_truth_touched is not true then raise exception 'invalid truth response'; end if;
  if p_confidence not between 0 and 100 or p_confidence_touched is not true then raise exception 'invalid confidence response'; end if;
  if p_action not in ('rely-on-claim', 'request-evidence', 'discount-claim') then raise exception 'invalid action'; end if;
  if p_counterfactual not in ('capability', 'object', 'condition', 'metric_scope') then raise exception 'invalid counterfactual'; end if;
  if p_response_ms not between 0 and 3600000 then raise exception 'invalid response time'; end if;
  if p_evidence_open_count not between 0 and 100 then raise exception 'invalid evidence count'; end if;

  insert into public.scopeproof_responses(
    session_id, item_id, position, response_status,
    truth_probability, truth_touched, confidence, confidence_touched,
    action, counterfactual, response_ms, evidence_open_count,
    event_uuid, client_created_at
  ) values (
    p_session_id, p_item_id, p_position, p_response_status,
    p_truth_probability, p_truth_touched, p_confidence, p_confidence_touched,
    p_action, p_counterfactual, p_response_ms, p_evidence_open_count,
    p_event_uuid, p_client_created_at
  );

  insert into public.scopeproof_events(
    event_uuid, session_id, item_id, event_type, elapsed_ms, payload, client_created_at
  ) values (
    p_event_uuid, p_session_id, p_item_id, 'item_submit', p_response_ms,
    jsonb_build_object(
      'position', p_position,
      'response_status', p_response_status,
      'truth_probability', p_truth_probability,
      'truth_touched', p_truth_touched,
      'confidence', p_confidence,
      'confidence_touched', p_confidence_touched,
      'action', p_action,
      'counterfactual', p_counterfactual,
      'evidence_open_count', p_evidence_open_count
    ), p_client_created_at
  );

  v_next := p_position + 1;
  update public.scopeproof_sessions
  set current_position = v_next,
      status = case when v_next = 12 then 'complete' else 'active' end,
      completed_at = case when v_next = 12 then now() else null end
  where session_id = p_session_id
  returning * into v_session;

  return jsonb_build_object(
    'current_position', v_session.current_position,
    'status', v_session.status,
    'completion_code', case when v_session.status = 'complete' then v_session.completion_code else null end
  );
end;
$$;

revoke execute on function public.create_scopeproof_session(text, text, text, text, text[], text, integer, integer) from public;
revoke execute on function public.get_scopeproof_session(uuid, text) from public;
revoke execute on function public.save_scopeproof_event(uuid, text, uuid, text, text, integer, jsonb, timestamptz) from public;
revoke execute on function public.save_scopeproof_response(uuid, text, text, integer, text, integer, boolean, integer, boolean, text, text, integer, integer, uuid, timestamptz) from public;

grant execute on function public.create_scopeproof_session(text, text, text, text, text[], text, integer, integer) to anon, authenticated;
grant execute on function public.get_scopeproof_session(uuid, text) to anon, authenticated;
grant execute on function public.save_scopeproof_event(uuid, text, uuid, text, text, integer, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.save_scopeproof_response(uuid, text, text, integer, text, integer, boolean, integer, boolean, text, text, integer, integer, uuid, timestamptz) to anon, authenticated;
