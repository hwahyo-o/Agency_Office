create extension if not exists pgcrypto;

create table if not exists public.agent_source_licenses (
  source_repo text primary key,
  license_name text not null,
  license_text text not null,
  source_revision text not null,
  imported_at timestamptz not null default now()
);

create table if not exists public.agent_templates (
  id uuid primary key default gen_random_uuid(),
  source_path text not null unique,
  source_url text not null,
  source_revision text not null,
  division text not null,
  role_name text not null,
  description text not null,
  emoji text,
  color text,
  vibe text,
  instructions_markdown text not null,
  is_active boolean not null default true,
  imported_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My AI Office',
  created_at timestamptz not null default now()
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  runner_key_hash text not null unique,
  adapter text not null default 'codex',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  title text not null,
  created_by uuid not null references auth.users(id),
  status text not null default 'open' check (status in ('open', 'waiting', 'completed', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  parent_message_id uuid references public.messages(id) on delete cascade,
  actor_type text not null check (actor_type in ('person', 'agent', 'system')),
  actor_id uuid,
  content text not null,
  approval_marked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade,
  agent_template_id uuid not null references public.agent_templates(id),
  machine_id uuid references public.machines(id) on delete set null,
  adapter text not null default 'codex',
  session_ref text,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  requested_action text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.owns_workspace(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspaces
    where id = target_workspace
      and owner_id = (select auth.uid())
  );
$$;

alter table public.agent_source_licenses enable row level security;
alter table public.agent_templates enable row level security;
alter table public.workspaces enable row level security;
alter table public.machines enable row level security;
alter table public.channels enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.agent_runs enable row level security;
alter table public.approvals enable row level security;

create policy "Authenticated users can read agent licenses"
  on public.agent_source_licenses for select to authenticated
  using (true);

create policy "Authenticated users can read agent templates"
  on public.agent_templates for select to authenticated
  using (is_active);

create policy "Owners can read workspaces"
  on public.workspaces for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Users can create their own workspace"
  on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners can manage machines"
  on public.machines for all to authenticated
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

create policy "Owners can manage channels"
  on public.channels for all to authenticated
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

create policy "Owners can manage threads"
  on public.threads for all to authenticated
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

create policy "Owners can manage messages"
  on public.messages for all to authenticated
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

create policy "Owners can manage agent runs"
  on public.agent_runs for all to authenticated
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

create policy "Owners can manage approvals"
  on public.approvals for all to authenticated
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));
