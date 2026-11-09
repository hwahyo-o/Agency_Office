import { authenticateRunner, jsonError } from '@/lib/runner-auth';

export const runtime = 'nodejs';

type ApprovalRequest = {
  runId?: string;
  method?: string;
  params?: Record<string, unknown>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function summarizeRequest(method: string, params: Record<string, unknown>) {
  if (method === 'item/commandExecution/requestApproval') {
    const command = typeof params.command === 'string' ? params.command : '(명령 내용 없음)';
    const reason = typeof params.reason === 'string' ? params.reason : '';
    return ['Codex 명령 실행 승인 요청', command, reason].filter(Boolean).join('\n');
  }

  const reason = typeof params.reason === 'string' ? params.reason : '파일 변경';
  const root = typeof params.grantRoot === 'string' ? params.grantRoot : '';
  return ['Codex 파일 변경 승인 요청', reason, root].filter(Boolean).join('\n');
}

export async function POST(request: Request) {
  let authenticated;
  try {
    authenticated = await authenticateRunner(request);
  } catch {
    return jsonError('Runner API server configuration is missing.', 503);
  }

  if (!authenticated) return jsonError('실행기 인증에 실패했습니다.', 401);

  let body: ApprovalRequest;
  try {
    body = await request.json();
  } catch {
    return jsonError('요청 형식이 올바르지 않습니다.', 400);
  }

  if (!body.runId || !uuidPattern.test(body.runId)) return jsonError('runId가 올바르지 않습니다.', 400);
  if (!body.method || !['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(body.method)) {
    return jsonError('지원하지 않는 승인 요청입니다.', 400);
  }
  if (!body.params || JSON.stringify(body.params).length > 20_000) {
    return jsonError('승인 요청 크기가 제한을 초과했습니다.', 413);
  }

  const { admin, machine } = authenticated;
  const { data: run, error: runError } = await admin
    .from('agent_runs')
    .select('id,workspace_id,machine_id,status')
    .eq('id', body.runId)
    .eq('machine_id', machine.id)
    .eq('status', 'running')
    .maybeSingle();

  if (runError || !run) return jsonError('이 실행기에 할당된 진행 중 작업이 아닙니다.', 404);

  await admin
    .from('approvals')
    .update({ status: 'rejected', decided_at: new Date().toISOString() })
    .eq('agent_run_id', run.id)
    .eq('status', 'pending');

  const approvalType = body.method === 'item/fileChange/requestApproval' ? 'file_change' : 'command';
  const { data: approval, error } = await admin
    .from('approvals')
    .insert({
      workspace_id: run.workspace_id,
      agent_run_id: run.id,
      approval_type: approvalType,
      requested_action: summarizeRequest(body.method, body.params),
      request_payload: body.params,
    })
    .select('id')
    .single();

  if (error || !approval) return jsonError('승인 요청을 저장하지 못했습니다.', 500);

  return Response.json({ approvalId: approval.id }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET(request: Request) {
  let authenticated;
  try {
    authenticated = await authenticateRunner(request);
  } catch {
    return jsonError('Runner API server configuration is missing.', 503);
  }

  if (!authenticated) return jsonError('실행기 인증에 실패했습니다.', 401);

  const approvalId = new URL(request.url).searchParams.get('approvalId');
  if (!approvalId || !uuidPattern.test(approvalId)) return jsonError('approvalId가 올바르지 않습니다.', 400);

  const { admin, machine } = authenticated;
  const { data: approval, error } = await admin
    .from('approvals')
    .select('id,agent_run_id,status')
    .eq('id', approvalId)
    .maybeSingle();

  if (error || !approval) return jsonError('승인 요청을 찾을 수 없습니다.', 404);

  const { data: run, error: runError } = await admin
    .from('agent_runs')
    .select('id')
    .eq('id', approval.agent_run_id)
    .eq('machine_id', machine.id)
    .maybeSingle();

  if (runError || !run) return jsonError('이 실행기의 승인 요청이 아닙니다.', 404);

  await admin
    .from('agent_runs')
    .update({ lease_expires_at: new Date(Date.now() + 120_000).toISOString() })
    .eq('id', approval.agent_run_id)
    .eq('machine_id', machine.id)
    .eq('status', 'running');

  const decision = approval.status === 'approved' ? 'accept'
    : approval.status === 'rejected' ? 'decline'
      : null;

  return Response.json({ status: approval.status, decision }, { headers: { 'cache-control': 'no-store' } });
}


export async function PATCH(request: Request) {
  let authenticated;
  try {
    authenticated = await authenticateRunner(request);
  } catch {
    return jsonError('Runner API server configuration is missing.', 503);
  }

  if (!authenticated) return jsonError('실행기 인증에 실패했습니다.', 401);

  let body: { approvalId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('요청 형식이 올바르지 않습니다.', 400);
  }

  if (!body.approvalId || !uuidPattern.test(body.approvalId)) {
    return jsonError('approvalId가 올바르지 않습니다.', 400);
  }

  const { admin, machine } = authenticated;
  const { data: approval, error } = await admin
    .from('approvals')
    .select('id,agent_run_id,status')
    .eq('id', body.approvalId)
    .maybeSingle();

  if (error || !approval) return jsonError('승인 요청을 찾을 수 없습니다.', 404);

  const { data: run, error: runError } = await admin
    .from('agent_runs')
    .select('id')
    .eq('id', approval.agent_run_id)
    .eq('machine_id', machine.id)
    .maybeSingle();

  if (runError || !run) return jsonError('이 실행기의 승인 요청이 아닙니다.', 404);

  const { data: updated, error: updateError } = await admin
    .from('approvals')
    .update({ status: 'rejected', decided_at: new Date().toISOString() })
    .eq('id', approval.id)
    .eq('status', 'pending')
    .select('status')
    .maybeSingle();

  if (updateError) return jsonError('승인 요청을 종료하지 못했습니다.', 500);

  const status = updated?.status ?? approval.status;
  const decision = status === 'approved' ? 'accept' : 'decline';

  return Response.json({ status, decision });
}
