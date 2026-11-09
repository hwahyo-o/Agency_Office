'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Machine = {
  id: string;
  name: string;
  adapter: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

type Enrollment = { machine: Machine; token: string };

type Props = {
  supabase: SupabaseClient | null;
  workspaceId: string | null;
};

export function RunnerConnection({ supabase, workspaceId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineName, setMachineName] = useState('내 PC');
  const [machineAdapter, setMachineAdapter] = useState('codex');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadMachines() {
    if (!supabase || !workspaceId) return;

    const { data, error } = await supabase
      .from('machines')
      .select('id,name,adapter,last_seen_at,revoked_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) {
      setNotice('실행기 목록을 불러오지 못했습니다.');
      return;
    }

    setMachines((data ?? []) as Machine[]);
  }

  useEffect(() => {
    if (!isOpen) return;
    void loadMachines();
  }, [isOpen, workspaceId]);

  async function enroll() {
    if (!supabase || !workspaceId) {
      setNotice('업무 공간을 먼저 불러와 주세요.');
      return;
    }

    setLoading(true);
    setNotice('');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      setLoading(false);
      setNotice('로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.');
      return;
    }

    const response = await fetch('/api/runner/enroll', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + sessionData.session.access_token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ workspaceId, name: machineName.trim(), adapter: machineAdapter }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setNotice(result.error ?? '실행기 등록에 실패했습니다.');
      return;
    }

    setEnrollment(result as Enrollment);
    await loadMachines();
  }

  async function revoke(machineId: string) {
    if (!supabase || !workspaceId) return;

    const { error } = await supabase
      .from('machines')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', machineId)
      .eq('workspace_id', workspaceId);

    if (error) {
      setNotice('실행기 연결을 해제하지 못했습니다.');
      return;
    }

    setNotice('실행기 연결을 해제했습니다.');
    await loadMachines();
  }

  async function copyToken() {
    if (!enrollment) return;

    try {
      await navigator.clipboard.writeText(enrollment.token);
      setNotice('일회용 토큰을 복사했습니다. 안전한 로컬 설정 파일에 붙여넣어 주세요.');
    } catch {
      setNotice('토큰을 직접 선택해 복사해 주세요.');
    }
  }

  return (
    <>
      <button className="runner-connect-button" type="button" onClick={() => setIsOpen(true)}>
        실행기 연결
      </button>
      {isOpen && (
        <div className="runner-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}>
          <section className="runner-modal" role="dialog" aria-modal="true" aria-labelledby="runner-title">
            <button className="runner-modal-close" type="button" onClick={() => setIsOpen(false)} aria-label="닫기">×</button>
            <p className="eyebrow">LOCAL CLI RUNNER</p>
            <h2 id="runner-title">내 PC의 AI CLI 연결</h2>
            <p className="muted">실행기는 PC에서 직접 동작합니다. 로그인 정보나 프로젝트 파일을 웹 서버에 보내지 않습니다.</p>

            {enrollment ? (
              <div className="runner-token-panel">
                <label htmlFor="runner-token">한 번만 표시되는 실행기 토큰</label>
                <textarea id="runner-token" readOnly value={enrollment.token} onFocus={(event) => event.currentTarget.select()} />
                <button className="secondary-button" type="button" onClick={() => void copyToken()}>토큰 복사</button>
                <p className="muted">토큰은 암호 관리자처럼 안전한 곳에 저장하세요. 창을 닫으면 다시 표시되지 않습니다.</p>
              </div>
            ) : (
              <>
                <div className="machine-list">
                  {machines.map((machine) => (
                    <div className="machine-row" key={machine.id}>
                      <span><strong>{machine.name} · {machine.adapter.toUpperCase()}</strong><small>{machine.revoked_at ? '연결 해제됨' : machine.last_seen_at ? '마지막 연결 ' + new Date(machine.last_seen_at).toLocaleString('ko-KR') : '아직 연결되지 않음'}</small></span>
                      {!machine.revoked_at && <button type="button" className="text-button" onClick={() => void revoke(machine.id)}>해제</button>}
                    </div>
                  ))}
                  {machines.length === 0 && <p className="muted">등록된 실행기가 없습니다.</p>}
                </div>
                <label className="field-label" htmlFor="runner-name">새 실행기 이름</label>
                <input id="runner-name" className="task-title-input" maxLength={80} value={machineName} onChange={(event) => setMachineName(event.target.value)} />
                <label className="field-label" htmlFor="runner-adapter">이 PC에서 사용할 CLI</label>
                <select id="runner-adapter" className="task-title-input" value={machineAdapter} onChange={(event) => setMachineAdapter(event.target.value)}>
                  <option value="codex">Codex CLI · 기본</option>
                  <option value="claude">Claude Code CLI</option>
                  <option value="gemini">Gemini CLI</option>
                </select>
                <p className="muted runner-adapter-note">Codex는 웹 승인 요청을 지원합니다. Claude/Gemini는 각 CLI의 기본 권한 설정을 사용합니다.</p>
                <button className="primary-button runner-enroll-button" type="button" disabled={loading || !machineName.trim()} onClick={() => void enroll()}>
                  {loading ? '등록 중…' : '실행기 등록 및 토큰 발급'}
                </button>
              </>
            )}

            {notice && <p className="notice" role="status">{notice}</p>}
            <div className="runner-setup-note">
              <strong>토큰 발급 후 실행</strong>
              <code>node platform/runner/runner.mjs</code>
              <small>PC에서 선택한 CLI 로그인과 프로젝트 폴더 설정이 필요합니다. 자세한 설정은 저장소의 runner 안내를 따라 주세요.</small>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
