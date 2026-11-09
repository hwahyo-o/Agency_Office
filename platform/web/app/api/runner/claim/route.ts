import { authenticateRunner, jsonError } from '@/lib/runner-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  let authenticated;
  try {
    authenticated = await authenticateRunner(request);
  } catch {
    return jsonError('Runner API server configuration is missing.', 503);
  }

  if (!authenticated) return jsonError('실행기 인증에 실패했습니다.', 401);

  const { data, error } = await authenticated.admin.rpc('claim_next_agent_run', {
    target_machine: authenticated.machine.id,
  });

  if (error) return jsonError('작업 대기열을 읽지 못했습니다.', 500);
  if (!data) return new Response(null, { status: 204 });

  return Response.json(data, { headers: { 'cache-control': 'no-store' } });
}
