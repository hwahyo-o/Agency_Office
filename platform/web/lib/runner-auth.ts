import 'server-only';

import { createHash } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type RunnerMachine = {
  id: string;
  workspace_id: string;
};

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Runner API server configuration is missing.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer ([A-Za-z0-9_-]{40,160})$/);
  return match?.[1] ?? null;
}

export function hashRunnerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function authenticateRunner(request: Request) {
  const token = getBearerToken(request);
  if (!token) return null;

  const admin = createAdminClient();
  const { data: machine, error } = await admin
    .from('machines')
    .select('id,workspace_id')
    .eq('runner_key_hash', hashRunnerToken(token))
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !machine) return null;

  return { admin, machine: machine as RunnerMachine };
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
