'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';
import { trackPageView } from '@/lib/firebase';
import { RunnerConnection } from '@/components/runner-connection';

type Agent = {
  id: string;
  role_name: string;
  description: string;
  division: string;
  emoji: string | null;
  vibe: string | null;
};

type Channel = { id: string; name: string; slug: string };
type Thread = { id: string; channel_id: string; title: string; status: string; created_at: string };
type Message = {
  id: string;
  thread_id: string;
  actor_type: 'person' | 'agent' | 'system';
  actor_id: string | null;
  content: string;
  created_at: string;
};
type AgentRun = {
  id: string;
  source_message_id: string;
  agent_template_id: string;
  status: string;
  adapter: string;
};
type AgentRunEvent = { id: string; agent_run_id: string; event_type: string; content: string | null; created_at: string };
type Approval = { id: string; agent_run_id: string; requested_action: string; request_payload: Record<string, unknown>; created_at: string };

function getTitle(draft: string, title: string) {
  const submittedTitle = title.trim();
  if (submittedTitle) return submittedTitle.slice(0, 90);

  return draft.trim().split(/\s+/).slice(0, 8).join(' ').slice(0, 90) || '새 작업';
}

function getChannelSlug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (base || 'channel') + '-' + Date.now().toString(36);
}

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [runEvents, setRunEvents] = useState<AgentRunEvent[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Approval[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(true);
  const [taskTitle, setTaskTitle] = useState('');
  const [selectedAdapter, setSelectedAdapter] = useState('codex');
  const [draft, setDraft] = useState('');
  const [agentQuery, setAgentQuery] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [channelDraft, setChannelDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const userId = user?.id;

  useEffect(() => {
    void trackPageView();
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    let isMounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.user);
      setCheckingSession(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setCheckingSession(false);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadAgents = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from('agent_templates')
      .select('id,role_name,description,division,emoji,vibe')
      .eq('is_active', true)
      .order('division')
      .order('role_name')
      .limit(500);

    if (error) {
      setNotice(error.message);
      return;
    }

    setAgents(data ?? []);
  }, [supabase]);

  const loadThreads = useCallback(async (nextChannelId: string) => {
    if (!supabase || !workspaceId) return;

    const { data, error } = await supabase
      .from('threads')
      .select('id,channel_id,title,status,created_at')
      .eq('workspace_id', workspaceId)
      .eq('channel_id', nextChannelId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      setNotice(error.message);
      return;
    }

    const nextThreads = data ?? [];
    setThreads(nextThreads);
    setActiveThreadId((currentId) => (
      currentId && nextThreads.some((thread) => thread.id === currentId) ? currentId : null
    ));
  }, [supabase, workspaceId]);

  const initializeWorkspace = useCallback(async (ownerId: string) => {
    if (!supabase) return;

    setLoading(true);
    setNotice('');

    const { data: existingWorkspace, error: workspaceReadError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', ownerId)
      .limit(1)
      .maybeSingle();

    if (workspaceReadError) {
      setLoading(false);
      setNotice(workspaceReadError.message);
      return;
    }

    let currentWorkspaceId = existingWorkspace?.id as string | undefined;

    if (!currentWorkspaceId) {
      const { data: createdWorkspace, error: workspaceCreateError } = await supabase
        .from('workspaces')
        .insert({ owner_id: ownerId, name: '내 AI 업무 공간' })
        .select('id')
        .single();

      if (workspaceCreateError) {
        setLoading(false);
        setNotice(workspaceCreateError.message);
        return;
      }

      currentWorkspaceId = createdWorkspace.id;
    }

    if (!currentWorkspaceId) {
      setLoading(false);
      setNotice('업무 공간을 확인하지 못했습니다. 다시 시도해 주세요.');
      return;
    }

    setWorkspaceId(currentWorkspaceId);

    const { data: existingChannels, error: channelReadError } = await supabase
      .from('channels')
      .select('id,name,slug')
      .eq('workspace_id', currentWorkspaceId)
      .order('created_at');

    if (channelReadError) {
      setLoading(false);
      setNotice(channelReadError.message);
      return;
    }

    let nextChannels = (existingChannels ?? []) as Channel[];
    if (nextChannels.length === 0) {
      const { data: createdChannel, error: channelCreateError } = await supabase
        .from('channels')
        .insert({
          workspace_id: currentWorkspaceId,
          created_by: ownerId,
          name: '일반',
          slug: 'general',
        })
        .select('id,name,slug')
        .single();

      if (channelCreateError) {
        setLoading(false);
        setNotice(channelCreateError.message);
        return;
      }

      nextChannels = [createdChannel as Channel];
    }

    setChannels(nextChannels);
    setActiveChannelId(nextChannels[0].id);
    await loadAgents();
    setLoading(false);
  }, [loadAgents, supabase]);

  useEffect(() => {
    if (!userId) return;
    void initializeWorkspace(userId);
  }, [initializeWorkspace, userId]);

  useEffect(() => {
    if (!activeChannelId) return;
    void loadThreads(activeChannelId);
  }, [activeChannelId, loadThreads]);

  const loadThread = useCallback(async (threadId: string) => {
    if (!supabase || !workspaceId) return;

    setNotice('');
    const { data: nextMessages, error: messageError } = await supabase
      .from('messages')
      .select('id,thread_id,actor_type,actor_id,content,created_at')
      .eq('workspace_id', workspaceId)
      .eq('thread_id', threadId)
      .order('created_at');

    if (messageError) {
      setNotice(messageError.message);
      return;
    }

    const messageRows = (nextMessages ?? []) as Message[];
    setMessages(messageRows);

    if (messageRows.length === 0) {
      setRuns([]);
      setRunEvents([]);
      setPendingApprovals([]);
      return;
    }

    const { data: nextRuns, error: runError } = await supabase
      .from('agent_runs')
      .select('id,source_message_id,agent_template_id,status,adapter')
      .eq('workspace_id', workspaceId)
      .in('source_message_id', messageRows.map((message) => message.id));

    if (runError) {
      setNotice(runError.message);
      return;
    }

    const loadedRuns = (nextRuns ?? []) as AgentRun[];
    setRuns(loadedRuns);

    if (loadedRuns.length === 0) {
      setRunEvents([]);
      setPendingApprovals([]);
      return;
    }

    const runIds = loadedRuns.map((run) => run.id);
    const [eventResult, approvalResult] = await Promise.all([
      supabase
        .from('agent_run_events')
        .select('id,agent_run_id,event_type,content,created_at')
        .in('agent_run_id', runIds)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('approvals')
        .select('id,agent_run_id,requested_action,request_payload,created_at')
        .in('agent_run_id', runIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (eventResult.error) {
      setNotice(eventResult.error.message);
      return;
    }
    if (approvalResult.error) {
      setNotice(approvalResult.error.message);
      return;
    }

    setRunEvents((eventResult.data ?? []) as AgentRunEvent[]);
    setPendingApprovals((approvalResult.data ?? []) as Approval[]);
  }, [supabase, workspaceId]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      setRuns([]);
      setRunEvents([]);
      setPendingApprovals([]);
      return;
    }

    void loadThread(activeThreadId);
    const refreshTimer = setInterval(() => void loadThread(activeThreadId), 5_000);

    return () => clearInterval(refreshTimer);
  }, [activeThreadId, loadThread]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');

    if (!supabase) {
      setNotice('Supabase 설정값을 platform/web/.env.local에 입력해 주세요.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    setNotice(error?.message ?? '');
  }

  async function signUp() {
    if (!supabase) {
      setNotice('Supabase 설정값을 platform/web/.env.local에 입력해 주세요.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    setNotice(error?.message ?? '가입 확인 메일을 확인해 주세요.');
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAgents([]);
    setChannels([]);
    setThreads([]);
    setRunEvents([]);
    setPendingApprovals([]);
    setWorkspaceId(null);
    setActiveChannelId(null);
    setActiveThreadId(null);
  }

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !workspaceId || !user) return;

    const name = channelDraft.trim();
    if (!name) return;

    const { data, error } = await supabase
      .from('channels')
      .insert({
        workspace_id: workspaceId,
        created_by: user.id,
        name,
        slug: getChannelSlug(name),
      })
      .select('id,name,slug')
      .single();

    if (error) {
      setNotice(error.message);
      return;
    }

    const channel = data as Channel;
    setChannels((current) => [...current, channel]);
    setChannelDraft('');
    setActiveChannelId(channel.id);
    setActiveThreadId(null);
    setIsComposing(true);
  }

  async function decideApproval(approvalId: string, decision: 'approved' | 'rejected') {
    if (!supabase || !activeThreadId) return;

    const { data, error } = await supabase.rpc('decide_approval', {
      target_approval: approvalId,
      next_status: decision,
    });
    if (error) {
      setNotice('승인 상태를 저장하지 못했습니다.');
      return;
    }
    if (!data) {
      setNotice('이미 처리된 승인 요청입니다.');
      return;
    }

    setNotice(decision === 'approved' ? '작업 요청을 승인했습니다.' : '작업 요청을 거절했습니다.');
    await loadThread(activeThreadId);
  }

  function startNewTask() {
    setActiveThreadId(null);
    setMessages([]);
    setRuns([]);
    setRunEvents([]);
    setPendingApprovals([]);
    setTaskTitle('');
    setSelectedAdapter('codex');
    setDraft('');
    setAgentQuery('');
    setSelectedAgentIds([]);
    setIsComposing(true);
    setNotice('');
  }

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((current) => (
      current.includes(agentId)
        ? current.filter((selectedId) => selectedId !== agentId)
        : [...current, agentId]
    ));
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !workspaceId || !activeChannelId || !user) return;

    const content = draft.trim();
    if (!content) {
      setNotice('직원에게 전달할 내용을 입력해 주세요.');
      return;
    }

    if (selectedAgentIds.length === 0) {
      setNotice('호출할 직원을 한 명 이상 선택해 주세요.');
      return;
    }

    setLoading(true);
    setNotice('');

    let threadId = activeThreadId;
    if (!threadId) {
      const { data: createdThread, error: threadError } = await supabase
        .from('threads')
        .insert({
          workspace_id: workspaceId,
          channel_id: activeChannelId,
          title: getTitle(content, taskTitle),
          created_by: user.id,
        })
        .select('id')
        .single();

      if (threadError) {
        setLoading(false);
        setNotice(threadError.message);
        return;
      }

      threadId = createdThread.id;
    }

    if (!threadId) {
      setLoading(false);
      setNotice('작업 스레드를 만들지 못했어요. 다시 시도해 주세요.');
      return;
    }

    const { data: createdMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        workspace_id: workspaceId,
        thread_id: threadId,
        actor_type: 'person',
        actor_id: user.id,
        content,
      })
      .select('id')
      .single();

    if (messageError) {
      setLoading(false);
      setNotice(messageError.message);
      return;
    }

    const queuedRuns = selectedAgentIds.map((agentId) => ({
      workspace_id: workspaceId,
      source_message_id: createdMessage.id,
      agent_template_id: agentId,
      adapter: selectedAdapter,
      status: 'queued',
    }));

    const { error: runError } = await supabase.from('agent_runs').insert(queuedRuns);
    setLoading(false);

    if (runError) {
      setNotice('메시지는 저장됐지만 직원 실행 대기열을 만들지 못했어요: ' + runError.message);
      setActiveThreadId(threadId);
      setIsComposing(false);
      await loadThreads(activeChannelId);
      return;
    }

    setActiveThreadId(threadId);
    setIsComposing(false);
    setTaskTitle('');
    setDraft('');
    setSelectedAgentIds([]);
    await loadThreads(activeChannelId);
    await loadThread(threadId);
    setNotice('작업 스레드에 저장했어요. 선택한 CLI 실행기가 연결되면 대기 작업을 이어받습니다.');
  }

  const visibleAgents = agents.filter((agent) => {
    const searchable = (agent.role_name + ' ' + agent.division + ' ' + agent.description).toLowerCase();
    return searchable.includes(agentQuery.toLowerCase());
  });
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  if (!supabase) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="eyebrow">AGENCY OFFICE · CODEX FIRST</p>
          <h1>직원형 AI 팀 오피스</h1>
          <p>Supabase 공개 URL과 키를 설정하면 역할별 직원 라이브러리를 연결할 수 있어요.</p>
          <p className="notice">설정 파일: <code>platform/web/.env.local</code></p>
        </section>
      </main>
    );
  }

  if (checkingSession) {
    return <main className="auth-page"><p className="muted">로그인 상태를 확인하고 있어요.</p></main>;
  }

  if (!user) {
    return (
      <main className="auth-page">
        <form className="auth-card" onSubmit={signIn}>
          <p className="eyebrow">AGENCY OFFICE · CODEX FIRST</p>
          <h1>AI 팀 오피스에 로그인</h1>
          <p>역할별 직원을 호출하고, 한 작업 스레드에서 함께 일하는 공간입니다.</p>
          <label htmlFor="email">이메일</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label htmlFor="password">비밀번호</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <div className="auth-actions">
            <button className="primary-button" disabled={loading}>로그인</button>
            <button className="secondary-button" type="button" disabled={loading} onClick={() => void signUp()}>계정 만들기</button>
          </div>
          {notice && <p className="notice" role="status">{notice}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="office-layout">
      <aside className="office-sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>Agency Office</span></div>
        <button className="new-task-button" onClick={startNewTask}>＋ 새 작업</button>

        <div className="sidebar-section">
          <div className="section-title"><span>채널</span><span>{channels.length}</span></div>
          <div className="channel-list">
            {channels.map((channel) => (
              <button
                className={channel.id === activeChannelId ? 'channel-item selected' : 'channel-item'}
                key={channel.id}
                onClick={() => {
                  setActiveChannelId(channel.id);
                  setActiveThreadId(null);
                  setIsComposing(true);
                }}
              >
                <span>#</span>{channel.name}
              </button>
            ))}
          </div>
          <form className="channel-form" onSubmit={createChannel}>
            <input aria-label="새 채널 이름" placeholder="채널 이름" value={channelDraft} onChange={(event) => setChannelDraft(event.target.value)} />
            <button aria-label="채널 만들기" disabled={!channelDraft.trim()}>＋</button>
          </form>
        </div>

        <div className="sidebar-section thread-section">
          <div className="section-title"><span>최근 작업</span><span>{threads.length}</span></div>
          <div className="thread-list">
            {threads.map((thread) => (
              <button
                className={thread.id === activeThreadId ? 'thread-item selected' : 'thread-item'}
                key={thread.id}
                onClick={() => {
                  setActiveThreadId(thread.id);
                  setIsComposing(false);
                  setNotice('');
                }}
              >
                <span className="thread-status" />{thread.title}
              </button>
            ))}
            {threads.length === 0 && <p className="sidebar-empty">이 채널의 작업이 아직 없어요.</p>}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="team-count"><span>✦</span><span>직원 라이브러리</span><strong>{agents.length}</strong></div>
          <div className="account-row">
            <span className="user-dot" />
            <span className="user-email">{user.email}</span>
            <button className="icon-button" onClick={() => void signOut()} aria-label="로그아웃">↪</button>
          </div>
        </div>
      </aside>

      <section className="office-main">
        <header className="office-topbar">
          <div><span className="topbar-workspace">내 업무 공간</span><span className="breadcrumb"> / {channels.find((channel) => channel.id === activeChannelId)?.name ?? '채널'}</span></div>
          <div className="topbar-actions"><RunnerConnection supabase={supabase} workspaceId={workspaceId} /><span className="runner-state"><i /> 로컬 러너 연결 대기</span></div>
        </header>

        <div className="conversation-area">
          {notice && <p className="notice office-notice" role="status">{notice}</p>}

          {isComposing ? (
            <form className="task-form" onSubmit={sendMessage}>
              <div className="task-intro">
                <p className="eyebrow">NEW TASK · {channels.find((channel) => channel.id === activeChannelId)?.name ?? '채널'}</p>
                <h1>어떤 일을 함께할까요?</h1>
                <p className="muted">직원을 선택하고 요청을 보내면 작업 스레드와 실행 대기 항목이 저장됩니다.</p>
              </div>
              <label className="field-label" htmlFor="task-title">작업 제목 <span>선택</span></label>
              <input id="task-title" className="task-title-input" placeholder="예: 신규 랜딩 페이지 기획" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
              <label className="field-label" htmlFor="agent-adapter">실행 CLI</label>
              <select id="agent-adapter" className="task-title-input" value={selectedAdapter} onChange={(event) => setSelectedAdapter(event.target.value)}>
                <option value="codex">Codex CLI · 권장</option>
                <option value="claude">Claude Code CLI</option>
                <option value="gemini">Gemini CLI</option>
              </select>
              {selectedAdapter !== 'codex' && <p className="muted adapter-policy-note">선택한 CLI의 기본 권한 설정으로 실행합니다. 웹 승인 카드와 진행 이벤트는 Codex 전용입니다.</p>}
              <div className="picker-heading">
                <label className="field-label" htmlFor="agent-search">호출할 직원</label>
                <span>{selectedAgentIds.length}명 선택</span>
              </div>
              <input id="agent-search" className="agent-search" placeholder="이름, 역할, 분야 검색" value={agentQuery} onChange={(event) => setAgentQuery(event.target.value)} />
              <div className="agent-picker">
                {visibleAgents.slice(0, 48).map((agent) => (
                  <label className={selectedAgentIds.includes(agent.id) ? 'agent-option checked' : 'agent-option'} key={agent.id}>
                    <input type="checkbox" checked={selectedAgentIds.includes(agent.id)} onChange={() => toggleAgent(agent.id)} />
                    <span className="agent-option-emoji">{agent.emoji ?? '✦'}</span>
                    <span className="agent-option-copy"><strong>{agent.role_name}</strong><small>{agent.division}</small></span>
                  </label>
                ))}
                {visibleAgents.length === 0 && <p className="muted picker-empty">검색 결과가 없어요.</p>}
                {visibleAgents.length > 48 && <p className="muted picker-empty">검색어를 입력해 직원을 좁혀 주세요. ({visibleAgents.length}명)</p>}
              </div>
              <label className="field-label" htmlFor="task-message">요청 내용</label>
              <textarea id="task-message" className="message-input" placeholder="목표, 참고 자료, 원하는 결과를 적어 주세요." value={draft} onChange={(event) => setDraft(event.target.value)} required />
              <div className="composer-footer"><span>선택한 직원은 선택한 CLI 실행기에 전달됩니다.</span><button className="primary-button" disabled={loading || !draft.trim()}>작업 시작 <span>→</span></button></div>
            </form>
          ) : (
            <div className="thread-view">
              <div className="thread-header">
                <div><p className="eyebrow">WORK THREAD</p><h1>{activeThread?.title ?? '작업'}</h1></div>
                <span className="thread-badge">{activeThread?.status ?? 'open'}</span>
              </div>
              <div className="message-timeline">
                {messages.map((message) => {
                  const assignedRuns = runs.filter((run) => run.source_message_id === message.id);
                  return (
                    <article className={message.actor_type === 'person' ? 'message-card from-person' : 'message-card'} key={message.id}>
                      <div className="message-meta"><strong>{message.actor_type === 'person' ? '나' : message.actor_type === 'agent' ? 'AI 직원' : '시스템'}</strong><time>{new Date(message.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</time></div>
                      <p>{message.content}</p>
                      {assignedRuns.length > 0 && (
                        <div className="run-list">
                          {assignedRuns.map((run) => {
                            const latestEvent = runEvents.find((event) => event.agent_run_id === run.id && event.event_type === 'progress');
                            const approval = pendingApprovals.find((item) => item.agent_run_id === run.id);
                            return (
                              <div className="run-detail" key={run.id}>
                                <span className="run-chip">
                                  <i className={run.status === 'completed' ? 'run-dot done' : 'run-dot'} />
                                  {agentById.get(run.agent_template_id)?.role_name ?? '직원'} · {run.adapter.toUpperCase()} · {approval && run.status === 'running' ? '승인 대기' : run.status === 'queued' ? '대기 중' : run.status}
                                </span>
                                {latestEvent?.content && <p className="run-progress">{latestEvent.content}</p>}
                                {approval && (
                                  <section className="approval-card">
                                    <strong>사람의 확인이 필요한 요청</strong>
                                    <pre>{approval.requested_action}</pre>
                                    <div>
                                      <button className="primary-button" type="button" onClick={() => void decideApproval(approval.id, 'approved')}>한 번 승인</button>
                                      <button className="secondary-button" type="button" onClick={() => void decideApproval(approval.id, 'rejected')}>거절</button>
                                    </div>
                                  </section>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
                {messages.length === 0 && <div className="empty">아직 메시지가 없어요.</div>}
              </div>
              <form className="reply-composer" onSubmit={sendMessage}>
                <input className="agent-search" placeholder="직원 이름, 역할 검색" value={agentQuery} onChange={(event) => setAgentQuery(event.target.value)} />
                <div className="selected-agents">
                  {selectedAgentIds.map((agentId) => {
                    const agent = agentById.get(agentId);
                    if (!agent) return null;
                    return <button type="button" className="selected-agent" key={agentId} onClick={() => toggleAgent(agentId)}>{agent.emoji ?? '✦'} {agent.role_name} ×</button>;
                  })}
                  {selectedAgentIds.length === 0 && <span className="muted">호출할 직원을 선택하세요</span>}
                </div>
                <div className="inline-agent-picker">
                  {visibleAgents.slice(0, 20).map((agent) => (
                    <button type="button" className={selectedAgentIds.includes(agent.id) ? 'inline-agent selected' : 'inline-agent'} key={agent.id} onClick={() => toggleAgent(agent.id)}>
                      {agent.emoji ?? '✦'} {agent.role_name}
                    </button>
                  ))}
                </div>
                <textarea className="reply-input" aria-label="답장 내용" placeholder="메시지를 입력하세요…" value={draft} onChange={(event) => setDraft(event.target.value)} required />
                <div className="composer-footer"><span>메시지와 직원 실행 상태가 이 스레드에 저장됩니다.</span><button className="primary-button" disabled={loading || !draft.trim()}>보내기 <span>→</span></button></div>
              </form>
            </div>
          )}

          {loading && <p className="loading-note">{workspaceId ? '저장하고 있어요.' : '업무 공간을 불러오고 있어요.'}</p>}
        </div>
      </section>
    </main>
  );
}
