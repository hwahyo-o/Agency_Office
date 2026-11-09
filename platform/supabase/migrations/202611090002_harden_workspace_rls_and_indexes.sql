create or replace function public.owns_workspace(target_workspace uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspaces
    where id = target_workspace
      and owner_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_workspace(uuid) from public, anon;
grant execute on function public.owns_workspace(uuid) to authenticated;

create index if not exists idx_workspaces_owner_id
  on public.workspaces(owner_id);
create index if not exists idx_machines_workspace_id
  on public.machines(workspace_id);
create index if not exists idx_channels_workspace_id
  on public.channels(workspace_id);
create index if not exists idx_channels_created_by
  on public.channels(created_by);
create index if not exists idx_threads_workspace_id
  on public.threads(workspace_id);
create index if not exists idx_threads_channel_id
  on public.threads(channel_id);
create index if not exists idx_threads_created_by
  on public.threads(created_by);
create index if not exists idx_messages_workspace_id
  on public.messages(workspace_id);
create index if not exists idx_messages_thread_id
  on public.messages(thread_id);
create index if not exists idx_messages_parent_message_id
  on public.messages(parent_message_id);
create index if not exists idx_agent_runs_workspace_id
  on public.agent_runs(workspace_id);
create index if not exists idx_agent_runs_source_message_id
  on public.agent_runs(source_message_id);
create index if not exists idx_agent_runs_agent_template_id
  on public.agent_runs(agent_template_id);
create index if not exists idx_agent_runs_machine_id
  on public.agent_runs(machine_id);
create index if not exists idx_approvals_workspace_id
  on public.approvals(workspace_id);
create index if not exists idx_approvals_agent_run_id
  on public.approvals(agent_run_id);
create index if not exists idx_approvals_decided_by
  on public.approvals(decided_by);
