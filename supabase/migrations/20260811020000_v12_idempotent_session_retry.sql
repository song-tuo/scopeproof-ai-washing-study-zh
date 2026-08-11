-- Make session creation safe to retry after a lost or delayed network response.
-- The same participant and token recover the existing session; a different token
-- still receives the normal participant-already-used error.

create or replace function public.create_scopeproof_session(
  p_token text,
  p_participant_id text,
  p_condition text,
  p_stimulus_set text,
  p_item_order text[],
  p_practice_summary jsonb,
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
  v_practice_order text[];
  v_insufficient_attempts integer;
  v_refuted_attempts integer;
  v_practice_elapsed_ms integer;
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

  if jsonb_typeof(p_practice_summary) is distinct from 'object'
    or not (p_practice_summary ?& array[
      'practice_version', 'practice_order', 'practice_attempts',
      'practice_elapsed_ms', 'passed_both_first_try'
    ])
    or (select count(*) from jsonb_object_keys(p_practice_summary)) <> 5
    or p_practice_summary->>'practice_version' <> 'practice-v1.1'
  then
    raise exception 'invalid practice summary';
  end if;

  if jsonb_typeof(p_practice_summary->'practice_order') is distinct from 'array'
    or jsonb_array_length(p_practice_summary->'practice_order') <> 2
  then
    raise exception 'invalid practice order';
  end if;
  select array_agg(value order by value)
  into v_practice_order
  from jsonb_array_elements_text(p_practice_summary->'practice_order') as entry(value);
  if v_practice_order is distinct from array['insufficient', 'refuted']::text[] then
    raise exception 'invalid practice order';
  end if;

  if jsonb_typeof(p_practice_summary->'practice_attempts') is distinct from 'object'
    or not ((p_practice_summary->'practice_attempts') ?& array['insufficient', 'refuted'])
    or (select count(*) from jsonb_object_keys(p_practice_summary->'practice_attempts')) <> 2
    or jsonb_typeof(p_practice_summary->'practice_attempts'->'insufficient') is distinct from 'number'
    or jsonb_typeof(p_practice_summary->'practice_attempts'->'refuted') is distinct from 'number'
    or (p_practice_summary->'practice_attempts'->>'insufficient') !~ '^([1-9]|1[0-9]|20)$'
    or (p_practice_summary->'practice_attempts'->>'refuted') !~ '^([1-9]|1[0-9]|20)$'
  then
    raise exception 'invalid practice attempts';
  end if;
  v_insufficient_attempts := (p_practice_summary->'practice_attempts'->>'insufficient')::integer;
  v_refuted_attempts := (p_practice_summary->'practice_attempts'->>'refuted')::integer;

  if jsonb_typeof(p_practice_summary->'practice_elapsed_ms') is distinct from 'number'
    or (p_practice_summary->>'practice_elapsed_ms') !~ '^(0|[1-9][0-9]{0,7})$'
  then
    raise exception 'invalid practice time';
  end if;
  v_practice_elapsed_ms := (p_practice_summary->>'practice_elapsed_ms')::integer;
  if v_practice_elapsed_ms not between 0 and 86400000 then
    raise exception 'invalid practice time';
  end if;

  if jsonb_typeof(p_practice_summary->'passed_both_first_try') is distinct from 'boolean'
    or (p_practice_summary->>'passed_both_first_try')::boolean is distinct from
      (v_insufficient_attempts = 1 and v_refuted_attempts = 1)
  then
    raise exception 'invalid practice first-try flag';
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
    select * into v_session
    from public.scopeproof_sessions
    where participant_id = p_participant_id
      and stimulus_set = p_stimulus_set
      and token_hash = extensions.digest(p_token, 'sha256');
    if found then
      return jsonb_build_object(
        'session_id', v_session.session_id,
        'condition', v_session.condition,
        'stimulus_set', v_session.stimulus_set,
        'item_order', to_jsonb(v_session.item_order),
        'current_position', v_session.current_position,
        'status', v_session.status,
        'completion_code', case when v_session.status = 'complete' then v_session.completion_code else null end
      );
    end if;
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
      'viewport', jsonb_build_array(p_viewport_width, p_viewport_height),
      'practice_summary', p_practice_summary
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

revoke execute on function public.create_scopeproof_session(
  text, text, text, text, text[], jsonb, text, integer, integer
) from public;

grant execute on function public.create_scopeproof_session(
  text, text, text, text, text[], jsonb, text, integer, integer
) to anon, authenticated;
