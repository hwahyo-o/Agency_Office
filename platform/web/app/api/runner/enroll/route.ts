import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient, jsonError } from '@/lib/runner-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const accessToken = authorization.match(/^Bearer (.+)$/)?.[1];
  if (!accessToken) return jsonError('로그인이 필요합니다.', 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publicKey) return jsonError('Supabase 설정이 필요합니다.', 503);

  const userClient = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) return jsonError('로그인 세션이 만료되었습니다.', 401);

  let body: { workspaceId?: string; name?: string; adapter?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError('요청 형식이 올바르지 않습니다.', 400);
  }

  const workspaceId = body.workspaceId?.trim();
  const name = body.name?.trim();
  const adapter = body.adapter ?? 'codex';
  if (!['codex', 'claude', 'gemini'].includes(adapter)) return jsonError('지원하지 않는 CLI입니다.', 400);
  if (!workspaceId || !name || name.length > 80) {
    return jsonError('업무 공간과 실행기 이름을 확인해 주세요.', 400);
  }

  const admin = createAdminClient();
  const { data: workspace, error: workspaceError } = await admin
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('owner_id', userData.user.id)
    .maybeSingle();

  if (workspaceError || !workspace) return jsonError('업무 공간을 확인할 수 없습니다.', 404);

  const runnerToken = randomBytes(32).toString('base64url');
  const runnerKeyHash = createHash('sha256').update(runnerToken, 'utf8').digest('hex');
  const { data: machine, error: insertError } = await admin
    .from('machines')
    .insert({
      workspace_id: workspaceId,
      name,
      runner_key_hash: runnerKeyHash,
      adapter,
    })
    .select('id,name')
    .single();

  if (insertError || !machine) return jsonError('실행기를 등록하지 못했습니다.', 500);

  return Response.json(
    { machine, token: runnerToken, tokenDelivery: 'display-once' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
