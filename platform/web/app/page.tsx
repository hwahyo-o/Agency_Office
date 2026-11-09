'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { trackPageView } from '@/lib/firebase';

type Agent = {
  id: string;
  role_name: string;
  description: string;
  division: string;
  emoji: string | null;
  vibe: string | null;
};

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [user, setUser] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    void trackPageView();
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user?.email ?? null);
      if (data.user) void loadAgents();
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user?.email ?? null;
      setUser(nextUser);
      if (nextUser) void loadAgents();
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  async function loadAgents() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('agent_templates')
      .select('id,role_name,description,division,emoji,vibe')
      .eq('is_active', true)
      .order('division')
      .order('role_name')
      .limit(500);

    if (error) {
      setMessage(error.message);
      return;
    }

    setAgents(data ?? []);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (!supabase) {
      setMessage('Supabase 설정값을 web/.env.local에 입력해 주세요.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    setMessage(error?.message ?? '');
  }

  async function signUp() {
    if (!supabase) {
      setMessage('Supabase 설정값을 web/.env.local에 입력해 주세요.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    setMessage(error?.message ?? '가입 확인 메일을 확인해 주세요.');
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAgents([]);
  }

  const filteredAgents = agents.filter((agent) => {
    const searchable = `${agent.role_name} ${agent.division} ${agent.description}`.toLowerCase();
    return searchable.includes(query.toLowerCase());
  });

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
          {message && <p className="notice" role="status">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>Agency Office</span></div>
        <p className="nav-label">WORKSPACE</p>
        <button className="nav-item active">◉ <span>전체 작업</span></button>
        <button className="nav-item"># <span>채널</span></button>
        <button className="nav-item">✓ <span>승인 대기</span></button>
        <p className="nav-label">TEAM</p>
        <button className="nav-item">✦ <span>직원 라이브러리</span><span className="count">{agents.length}</span></button>
        <div className="sidebar-bottom">
          <span className="user-dot" />
          <span className="user-email">{user}</span>
          <button className="icon-button" onClick={() => void signOut()} aria-label="로그아웃">↪</button>
        </div>
      </aside>
      <section className="main-content">
        <header className="topbar"><span>내 업무 공간</span><span className="connection"><i /> Codex 러너 연결 준비 중</span></header>
        <div className="content">
          <div className="page-heading">
            <div><p className="eyebrow">AI TEAM</p><h1>직원 라이브러리</h1><p className="muted">역할별 직원 지침을 가져와 업무에 맞는 직원을 호출할 수 있어요.</p></div>
            <button className="primary-button" onClick={() => setMessage('직원 라이브러리를 확인했어요. 작업 스레드와 로컬 Codex 러너는 다음 단계에서 연결합니다.')}>새 작업</button>
          </div>
          {message && <p className="notice" role="status">{message}</p>}
          <div className="toolbar">
            <input className="search" placeholder="직원 이름, 역할, 분야 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
            <span className="muted">{filteredAgents.length}명 표시</span>
          </div>
          <div className="agent-grid">
            {filteredAgents.map((agent) => (
              <article className="agent-card" key={agent.id}>
                <div className="agent-top"><span className="agent-emoji">{agent.emoji ?? '✦'}</span><span className="division">{agent.division}</span></div>
                <h2>{agent.role_name}</h2>
                <p>{agent.vibe || agent.description}</p>
                <button className="text-button" onClick={() => setMessage(`${agent.role_name}: ${agent.description}`)}>직원 정보 보기 <span>→</span></button>
              </article>
            ))}
          </div>
          {filteredAgents.length === 0 && <div className="empty">가져온 직원이 없어요. README의 import 단계를 진행해 주세요.</div>}
        </div>
      </section>
    </main>
  );
}
