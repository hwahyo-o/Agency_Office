create index if not exists idx_agent_run_events_run_id
  on public.agent_run_events(agent_run_id);

create index if not exists idx_agent_run_events_machine_id
  on public.agent_run_events(machine_id);
