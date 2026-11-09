create or replace function public.claim_next_agent_run(target_machine uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  machine_workspace uuid;
  claimed_run uuid;
  payload jsonb;
begin
  select workspace_id
    into machine_workspace
    from public.machines
    where id = target_machine
      and revoked_at is null
    for update;

  if machine_workspace is null then
    return null;
  end if;

  update public.machines
    set last_seen_at = now()
    where id = target_machine;

  select run.id
    into claimed_run
    from public.agent_runs run
    join public.messages queued_message on queued_message.id = run.source_message_id
    where run.workspace_id = machine_workspace
      and run.adapter = 'codex'
      and (
        run.status = 'queued'
        or (
          run.status = 'running'
          and run.machine_id = target_machine
          and run.lease_expires_at < now()
        )
      )
      and not exists (
        select 1
        from public.agent_runs active_run
        join public.messages active_message on active_message.id = active_run.source_message_id
        where active_run.workspace_id = run.workspace_id
          and active_run.status = 'running'
          and active_run.id <> run.id
          and active_message.thread_id = queued_message.thread_id
      )
    order by run.created_at
    limit 1
    for update of run skip locked;

  if claimed_run is null then
    return null;
  end if;

  update public.agent_runs
    set machine_id = target_machine,
        status = 'running',
        started_at = coalesce(started_at, now()),
        lease_expires_at = now() + interval '2 minutes',
        error_code = null
    where id = claimed_run;

  select jsonb_build_object(
    'runId', run.id,
    'threadId', message.thread_id,
    'sourceMessageId', message.id,
    'request', message.content,
    'roleName', template.role_name,
    'division', template.division,
    'instructions', template.instructions_markdown,
    'sessionRef', coalesce(run.session_ref, previous_run.session_ref)
  )
  into payload
  from public.agent_runs run
  join public.messages message on message.id = run.source_message_id
  join public.agent_templates template on template.id = run.agent_template_id
  left join lateral (
    select prior.session_ref
    from public.agent_runs prior
    join public.messages prior_message on prior_message.id = prior.source_message_id
    where prior.workspace_id = run.workspace_id
      and prior.agent_template_id = run.agent_template_id
      and prior.machine_id = target_machine
      and prior_message.thread_id = message.thread_id
      and prior.id <> run.id
      and prior.session_ref is not null
    order by prior.created_at desc
    limit 1
  ) previous_run on true
  where run.id = claimed_run;

  return payload;
end;
$$;

revoke execute on function public.claim_next_agent_run(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_agent_run(uuid) to service_role;
