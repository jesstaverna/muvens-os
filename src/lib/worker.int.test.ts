import { createHmac } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';
import { describe, expect, it } from 'vitest';
import { runWorker } from './worker';

// Teste de integração do worker contra PostgREST local (ver supabase/tests/). Ignorado sem PGRST_URL.
const URL = process.env.PGRST_URL;
const SECRET = process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret-123456';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(role: string) {
  const h = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${h}.${createHmac('sha256', SECRET).update(h).digest('base64url')}`;
}

describe.skipIf(!URL)('worker (integração)', () => {
  const db = () => new PostgrestClient(URL!, { headers: { Authorization: `Bearer ${token('service_role')}` } });

  it('processa jobs pendentes, agenda a varredura horária e é idempotente', async () => {
    const c = db();
    const first = await runWorker(c as never);
    expect(first.failed).toBe(0);
    expect(first.done).toBeGreaterThan(0);

    const { data: scans } = await c.from('jobs').select('id, status').eq('type', 'scan.all');
    expect(scans?.length).toBe(1);
    expect(scans?.[0].status).toBe('done');

    await runWorker(c as never); // segunda chamada na mesma hora não cria nova varredura
    const { data: again } = await c.from('jobs').select('id').eq('type', 'scan.all');
    expect(again?.length).toBe(1);
  });

  it('job de tipo desconhecido falha com retentativa agendada (não trava a fila)', async () => {
    const c = db();
    await c.from('jobs').insert({ type: 'tipo.inexistente' });
    const r = await runWorker(c as never);
    expect(r.failed).toBe(1);
    const { data } = await c.from('jobs').select('status, attempts, last_error, run_at').eq('type', 'tipo.inexistente').single();
    expect(data?.status).toBe('failed');
    expect(data?.last_error).toContain('Sem handler');
    expect(new Date(data!.run_at).getTime()).toBeGreaterThan(Date.now());
  });
});
