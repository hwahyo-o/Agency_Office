alter table public.machines
  add column if not exists revoked_at timestamptz;

alter table public.agent_runs
  add column if not exists lease_expires_at timestamptz;

create index if not exists idx_agent_runs_queue
  on public.agent_runs(workspace_id, status, created_at)
  where status in ('queued', 'running');

create table if not exists public.agent_run_events (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  event_key uuid not null unique,
  event_type text not null check (event_type in ('progress', 'completed', 'failed')),
  content text,
  created_at timestamptz not null default now()
);

alter table public.agent_run_events enable row level security;

create policy "Owners can read agent run events"
  on public.agent_run_events for select to authenticated
  using (
    exists (
      select 1
      from public.agent_runs run
      where run.id = agent_run_id
        and public.owns_workspace(run.workspace_id)
    )
  );

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
    order by run.created_at
    limit 1
    for update skip locked;

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
  if event_kind not in ('progress', 'completed', 'failed') then
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
