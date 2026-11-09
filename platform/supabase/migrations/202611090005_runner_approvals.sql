alter table public.approvals
  add column if not exists approval_type text not null default 'command'
    check (approval_type in ('command', 'file_change')),
  add column if not exists request_payload jsonb not null default '{}'::jsonb;

create index if not exists idx_approvals_pending_workspace
  on public.approvals(workspace_id, created_at)
  where status = 'pending';

create or replace function public.decide_approval(
  target_approval uuid,
  next_status text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_id uuid;
begin
  if next_status not in ('approved', 'rejected') then
    raise exception 'Invalid approval decision';
  end if;

  update public.approvals
    set status = next_status,
        decided_by = (select auth.uid()),
        decided_at = now()
    where id = target_approval
      and status = 'pending'
      and public.owns_workspace(workspace_id)
    returning id into changed_id;

  return changed_id is not null;
end;
$$;

revoke execute on function public.decide_approval(uuid, text) from public, anon;
grant execute on function public.decide_approval(uuid, text) to authenticated;
