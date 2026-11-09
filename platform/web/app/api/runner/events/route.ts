import { authenticateRunner, jsonError } from '@/lib/runner-auth';

export const runtime = 'nodejs';

type RunnerEvent = {
  runId?: string;
  eventKey?: string;
  type?: 'progress' | 'completed' | 'failed';
  content?: string;
  sessionRef?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let authenticated;
  try {
    authenticated = await authenticateRunner(request);
  } catch {
    return jsonError('Runner API server configuration is missing.', 503);
  }

  if (!authenticated) return jsonError('실행기 인증에 실패했습니다.', 401);

  let body: RunnerEvent;
  try {
    body = await request.json();
  } catch {
    return jsonError('요청 형식이 올바르지 않습니다.', 400);
  }

  if (!body.runId || !uuidPattern.test(body.runId)) return jsonError('runId가 올바르지 않습니다.', 400);
  if (!body.eventKey || !uuidPattern.test(body.eventKey)) return jsonError('eventKey가 올바르지 않습니다.', 400);
  if (!body.type || !['progress', 'completed', 'failed'].includes(body.type)) {
    return jsonError('이벤트 유형이 올바르지 않습니다.', 400);
  }
  if ((body.content?.length ?? 0) > 40000 || (body.sessionRef?.length ?? 0) > 200) {
    return jsonError('이벤트 크기가 제한을 초과했습니다.', 413);
  }

  const { data, error } = await authenticated.admin.rpc('record_runner_event', {
    target_machine: authenticated.machine.id,
    target_run: body.runId,
    idempotency_key: body.eventKey,
    event_kind: body.type,
    event_content: body.content ?? null,
    codex_session_ref: body.sessionRef ?? null,
  });

  if (error) return jsonError('작업 상태를 저장하지 못했습니다.', 409);

  return Response.json({ accepted: true, duplicate: data === false });
}
