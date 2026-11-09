-- Keep active local CLI runs leased while they execute without emitting progress.
create or replace function public.record_runner_event(
  target_machine uuid,
  target_run uuid,
  idempotency_key uuid,
  event_kind text,
  event_content text default null,
  codex_session_ref text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_workspace uuid;
  run_template uuid;
  run_thread uuid;
  inserted_event uuid;
begin
  if event_kind not in ('progress', 'completed', 'failed', 'heartbeat') then
    raise exception 'Unsupported runner event';
  end if;

  select run.workspace_id, run.agent_template_id, message.thread_id
    into run_workspace, run_template, run_thread
    from public.agent_runs run
    join public.machines machine
      on machine.id = run.machine_id
     and machine.workspace_id = run.workspace_id
     and machine.revoked_at is null
    join public.messages message on message.id = run.source_message_id
    where run.id = target_run
      and run.machine_id = target_machine
    for update of run;

  if run_workspace is null then
    raise exception 'Run is not assigned to this machine';
  end if;

  if event_kind = 'heartbeat' then
    update public.agent_runs
      set lease_expires_at = now() + interval '2 minutes',
          session_ref = coalesce(codex_session_ref, session_ref)
      where id = target_run;
    return true;
  end if;

  insert into public.agent_run_events (agent_run_id, machine_id, event_key, event_type, content)
  values (target_run, target_machine, idempotency_key, event_kind, left(event_content, 40000))
  on conflict (event_key) do nothing
  returning id into inserted_event;

  if inserted_event is null then
    return false;
  end if;

  update public.agent_runs
    set lease_expires_at = now() + interval '2 minutes',
        session_ref = coalesce(codex_session_ref, session_ref),
        status = case
          when event_kind = 'completed' then 'completed'
          when event_kind = 'failed' then 'failed'
          else 'running'
        end,
        error_code = case when event_kind = 'failed' then 'runner_failed' else null end,
        finished_at = case when event_kind in ('completed', 'failed') then now() else null end
    where id = target_run;

  if event_kind in ('completed', 'failed') and nullif(trim(event_content), '') is not null then
    insert into public.messages (
      workspace_id, thread_id, parent_message_id, actor_type, actor_id, content
    )
    values (
      run_workspace, run_thread,
      (select source_message_id from public.agent_runs where id = target_run),
      case when event_kind = 'completed' then 'agent' else 'system' end,
      case when event_kind = 'completed' then run_template else null end,
      left(event_content, 40000)
    );
  end if;

  return true;
end;
$$;

revoke execute on function public.record_runner_event(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_runner_event(uuid, uuid, uuid, text, text, text) to service_role;
