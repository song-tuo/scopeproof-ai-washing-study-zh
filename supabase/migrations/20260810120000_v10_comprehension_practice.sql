-- ScopeProof 中文研究 v1.0：加入强制理解练习并统一正式题目用语。
-- 刺激事实与分组机制不变；参与者可见流程与 v0.9 分开记录。

alter table public.scopeproof_sessions
  drop constraint if exists scopeproof_sessions_stimulus_set_check;
alter table public.scopeproof_sessions
  add constraint scopeproof_sessions_stimulus_set_check
  check (stimulus_set in ('study12-zh-cn-v0.5', 'study12-zh-cn-v0.6', 'study12-zh-cn-v0.7', 'study12-zh-cn-v0.8', 'study12-zh-cn-v0.9', 'study12-zh-cn-v1.0'));

alter table public.scopeproof_responses
  drop constraint if exists scopeproof_responses_h3_answer_key_version_check;
alter table public.scopeproof_responses
  add constraint scopeproof_responses_h3_answer_key_version_check
  check (h3_answer_key_version is null or h3_answer_key_version in ('h3-set-v0.6', 'h3-set-v0.7', 'h3-set-v0.8', 'h3-set-v0.9', 'h3-set-v1.0'));

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
  v_condition text;
  v_allowed constant text[] := array[
    'P-S-01', 'P-S-04', 'A-S-01', 'P-R-01', 'A-R-02', 'A-R-03',
    'P-I-01', 'P-I-02', 'A-I-01', 'P-F-01', 'A-F-01', 'A-F-02'
  ];
begin
  if p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid session token'; end if;
  if p_participant_id !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'invalid participant id'; end if;
  if p_stimulus_set <> 'study12-zh-cn-v1.0' then raise exception 'invalid stimulus set'; end if;
  if array_length(p_item_order, 1) <> 12
    or (select count(distinct item) from unnest(p_item_order) as item) <> 12
    or exists (select 1 from unnest(p_item_order) as item where not (item = any(v_allowed)))
  then
    raise exception 'invalid item order';
  end if;
  if p_viewport_width not between 240 and 10000 or p_viewport_height not between 240 and 10000 then
    raise exception 'invalid viewport';
  end if;

  if p_condition is null then
    perform pg_advisory_xact_lock(202608101200);
    select case
      when count(*) filter (where condition = 'baseline')
        <= count(*) filter (where condition = 'scopeproof')
      then 'baseline'
      else 'scopeproof'
    end
    into v_condition
    from public.scopeproof_sessions
    where stimulus_set = 'study12-zh-cn-v1.0';
  elsif p_condition in ('baseline', 'scopeproof') then
    v_condition := p_condition;
  else
    raise exception 'invalid condition';
  end if;

  begin
    insert into public.scopeproof_sessions(
      token_hash, participant_id, condition, stimulus_set, item_order,
      user_agent, viewport_width, viewport_height
    ) values (
      extensions.digest(p_token, 'sha256'), p_participant_id, v_condition,
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
      'condition', v_condition,
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
  p_h3_selected_ids text[],
  p_h3_option_order text[],
  p_h3_explicit_none boolean,
  p_priority_eligible_ids text[],
  p_priority_selected_id text,
  p_priority_option_order text[],
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
  v_allowed_slots constant text[] := array['capability', 'object', 'condition', 'metric_scope'];
  v_selected_count integer;
  v_selected_sorted text[];
  v_eligible_sorted text[];
  v_priority_sorted text[];
  v_slot_states jsonb;
  v_answer_key_version text;
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
  if v_session.stimulus_set not in ('study12-zh-cn-v0.6', 'study12-zh-cn-v0.7', 'study12-zh-cn-v0.8', 'study12-zh-cn-v0.9', 'study12-zh-cn-v1.0') then raise exception 'wrong response version'; end if;
  v_answer_key_version := case
    when v_session.stimulus_set = 'study12-zh-cn-v1.0' then 'h3-set-v1.0'
    when v_session.stimulus_set = 'study12-zh-cn-v0.9' then 'h3-set-v0.9'
    when v_session.stimulus_set = 'study12-zh-cn-v0.8' then 'h3-set-v0.8'
    when v_session.stimulus_set = 'study12-zh-cn-v0.7' then 'h3-set-v0.7'
    else 'h3-set-v0.6'
  end;
  if p_position <> v_session.current_position
    or v_session.item_order[p_position + 1] <> p_item_id
  then raise exception 'unexpected item position'; end if;
  if p_response_status not in ('supported', 'refuted', 'insufficient') then raise exception 'invalid response status'; end if;
  if p_truth_probability not between 0 and 100 or p_truth_touched is not true then raise exception 'invalid truth response'; end if;
  if p_confidence not between 0 and 100 or p_confidence_touched is not true then raise exception 'invalid confidence response'; end if;
  if p_action not in ('rely-on-claim', 'request-evidence', 'discount-claim') then raise exception 'invalid action'; end if;
  if p_response_ms not between 0 and 3600000 then raise exception 'invalid response time'; end if;
  if p_evidence_open_count not between 0 and 100 then raise exception 'invalid evidence count'; end if;

  if cardinality(coalesce(p_h3_option_order, array[]::text[])) <> 4
    or (select count(distinct value) from unnest(coalesce(p_h3_option_order, array[]::text[])) as u(value)) <> 4
    or exists (
      select 1 from unnest(coalesce(p_h3_option_order, array[]::text[])) as u(value)
      where not (value = any(v_allowed_slots))
    )
  then raise exception 'invalid H3 option order'; end if;

  v_selected_count := cardinality(coalesce(p_h3_selected_ids, array[]::text[]));
  if v_selected_count > 4
    or (select count(distinct value) from unnest(coalesce(p_h3_selected_ids, array[]::text[])) as u(value)) <> v_selected_count
    or exists (
      select 1 from unnest(coalesce(p_h3_selected_ids, array[]::text[])) as u(value)
      where not (value = any(v_allowed_slots))
    )
  then raise exception 'invalid H3 selected set'; end if;

  select coalesce(array_agg(value order by value), array[]::text[])
  into v_selected_sorted
  from unnest(coalesce(p_h3_selected_ids, array[]::text[])) as u(value);
  select coalesce(array_agg(value order by value), array[]::text[])
  into v_eligible_sorted
  from unnest(coalesce(p_priority_eligible_ids, array[]::text[])) as u(value);
  select coalesce(array_agg(value order by value), array[]::text[])
  into v_priority_sorted
  from unnest(coalesce(p_priority_option_order, array[]::text[])) as u(value);

  if v_selected_count = 0 then
    if p_h3_explicit_none is distinct from true
      or cardinality(coalesce(p_priority_eligible_ids, array[]::text[])) <> 0
      or cardinality(coalesce(p_priority_option_order, array[]::text[])) <> 0
      or p_priority_selected_id is not null
    then raise exception 'invalid empty H3 response'; end if;
  else
    if p_h3_explicit_none is distinct from false
      or cardinality(coalesce(p_priority_eligible_ids, array[]::text[])) <> v_selected_count
      or cardinality(coalesce(p_priority_option_order, array[]::text[])) <> v_selected_count
      or v_eligible_sorted <> v_selected_sorted
      or v_priority_sorted <> v_selected_sorted
      or p_priority_selected_id is null
      or not (p_priority_selected_id = any(v_selected_sorted))
    then raise exception 'invalid priority response'; end if;
  end if;

  v_slot_states := case p_item_id
    when 'P-S-01' then '{"capability":"covered","object":"covered","condition":"covered","metric_scope":"covered"}'::jsonb
    when 'P-S-04' then '{"capability":"covered","object":"covered","condition":"covered","metric_scope":"covered"}'::jsonb
    when 'A-S-01' then '{"capability":"covered","object":"covered","condition":"covered","metric_scope":"covered"}'::jsonb
    when 'P-R-01' then '{"capability":"covered","object":"covered","condition":"covered","metric_scope":"non_covered"}'::jsonb
    when 'A-R-02' then '{"capability":"covered","object":"covered","condition":"covered","metric_scope":"non_covered"}'::jsonb
    when 'A-R-03' then '{"capability":"covered","object":"covered","condition":"covered","metric_scope":"non_covered"}'::jsonb
    when 'P-I-01' then '{"capability":"non_covered","object":"covered","condition":"non_covered","metric_scope":"non_covered"}'::jsonb
    when 'P-I-02' then '{"capability":"non_covered","object":"covered","condition":"covered","metric_scope":"non_covered"}'::jsonb
    when 'A-I-01' then '{"capability":"covered","object":"covered","condition":"non_covered","metric_scope":"non_covered"}'::jsonb
    when 'P-F-01' then '{"capability":"non_covered","object":"covered","condition":"non_covered","metric_scope":"non_covered"}'::jsonb
    when 'A-F-01' then '{"capability":"non_covered","object":"non_covered","condition":"covered","metric_scope":"non_covered"}'::jsonb
    when 'A-F-02' then '{"capability":"non_covered","object":"covered","condition":"non_covered","metric_scope":"non_covered"}'::jsonb
    else null
  end;
  if v_slot_states is null then raise exception 'unknown item'; end if;

  insert into public.scopeproof_responses(
    session_id, item_id, position, response_status,
    truth_probability, truth_touched, confidence, confidence_touched,
    action, counterfactual, h3_selected_ids, h3_option_order, h3_slot_states,
    h3_answer_key_version, h3_explicit_none, priority_eligible_ids,
    priority_selected_id, priority_option_order, response_ms, evidence_open_count,
    event_uuid, client_created_at
  ) values (
    p_session_id, p_item_id, p_position, p_response_status,
    p_truth_probability, p_truth_touched, p_confidence, p_confidence_touched,
    p_action, null, coalesce(p_h3_selected_ids, array[]::text[]), p_h3_option_order, v_slot_states,
    v_answer_key_version, p_h3_explicit_none, coalesce(p_priority_eligible_ids, array[]::text[]),
    p_priority_selected_id, coalesce(p_priority_option_order, array[]::text[]), p_response_ms, p_evidence_open_count,
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
      'selected_option_ids', to_jsonb(coalesce(p_h3_selected_ids, array[]::text[])),
      'option_order', to_jsonb(p_h3_option_order),
      'slot_states', v_slot_states,
      'answer_key_version', v_answer_key_version,
      'h3_explicit_none', p_h3_explicit_none,
      'eligible_priority_option_ids', to_jsonb(coalesce(p_priority_eligible_ids, array[]::text[])),
      'selected_priority_option_id', p_priority_selected_id,
      'priority_option_order', to_jsonb(coalesce(p_priority_option_order, array[]::text[])),
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
revoke execute on function public.save_scopeproof_response(
  uuid, text, text, integer, text, integer, boolean, integer, boolean,
  text, text[], text[], boolean, text[], text, text[], integer, integer, uuid, timestamptz
) from public;

grant execute on function public.create_scopeproof_session(text, text, text, text, text[], text, integer, integer) to anon, authenticated;
grant execute on function public.save_scopeproof_response(
  uuid, text, text, integer, text, integer, boolean, integer, boolean,
  text, text[], text[], boolean, text[], text, text[], integer, integer, uuid, timestamptz
) to anon, authenticated;
