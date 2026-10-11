// Abre as páginas do sistema (build de produção) logado como cada perfil, contra o PostgREST local, e falha se alguma der erro de servidor.
// Um servidor falso imita só o que o app usa do Supabase: /auth/v1/user e /rest/v1/* (repassado ao PostgREST).
// Uso (após run_local.sh e com o PostgREST de pé em :3111, e `npx next build` feito):  node supabase/tests/page_smoke.mjs
import { createHmac } from 'node:crypto';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';

const SECRET = process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret-123456';
const PGRST = { host: '127.0.0.1', port: 3111 }, FAKE = 3099, APP = 3098;
const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const jwt = (sub, role = 'authenticated') => { const h = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub, role, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}`; return `${h}.${createHmac('sha256', SECRET).update(h).digest('base64url')}`; };
const U = { admin: '00000000-0000-0000-0000-0000000000a1', comercial: '00000000-0000-0000-0000-0000000000a2', financeiro: '00000000-0000-0000-0000-0000000000a3', designer: '00000000-0000-0000-0000-0000000000a4', cliente: '00000000-0000-0000-0000-0000000000b1' };

const fake = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/auth/v1/user') {
    const tok = (req.headers.authorization ?? '').replace('Bearer ', ''); let sub;
    try { sub = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).sub; } catch { /* inválido */ }
    if (!sub) { res.statusCode = 401; return res.end('{}'); }
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ id: sub, aud: 'authenticated', role: 'authenticated', email: `${sub}@test.local`, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }));
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    const headers = { ...req.headers, host: `${PGRST.host}:${PGRST.port}` }; delete headers['content-length'];
    const p = request({ ...PGRST, method: req.method, path: url.pathname.replace('/rest/v1', '') + url.search, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', () => { res.statusCode = 502; res.end(); }); return req.pipe(p);
  }
  res.statusCode = 404; res.end('{}');
});
await new Promise((r) => fake.listen(FAKE, '127.0.0.1', r));

// recusa porta ocupada (um servidor antigo responderia no lugar do build atual)
try { await fetch(`http://127.0.0.1:${APP}/api/health`); console.error(`Porta ${APP} já está em uso: encerre o servidor antigo.`); process.exit(2); } catch { /* livre */ }
const app = spawn('npx', ['next', 'start', '-p', String(APP)], { detached: true, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${APP}`, CRON_SECRET: 'x' }, stdio: 'pipe' });
let log = ''; app.stdout.on('data', (d) => (log += d)); app.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${APP}/api/health`)).ok) break; } catch { /* aguardando */ } await new Promise((r) => setTimeout(r, 500)); }

const cookie = (sub) => { const s = { access_token: jwt(sub), refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: sub, email: `${sub}@test.local`, aud: 'authenticated', role: 'authenticated' } }; return `sb-127-auth-token=base64-${b64u(s)}`; };
const STAFF_PAGES = ['/dashboard', '/alertas', '/crm', '/crm/novo', '/clientes', '/clientes/novo', '/propostas', '/propostas/nova', '/financeiro', '/financeiro?tab=receber', '/financeiro?tab=recorrentes', '/financeiro?tab=novo', '/metas', '/automacoes', '/configuracoes',
  '/contratos', '/contratos/modelos', '/projetos', '/projetos?view=lista', '/projetos?view=projetos', '/projetos?view=entregaveis', '/projetos?view=rentabilidade', '/projetos/novo', '/projetos/tarefas/nova', '/calendario', '/brand', '/portal', '/portal?tab=documentos', '/portal?tab=acessos',
  '/prospeccao', '/prospeccao?tab=campanhas', '/prospeccao?tab=fila', '/prospeccao?tab=novo', '/prospeccao?tab=bloqueios', '/prospeccao?tab=config', '/prospeccao?tab=prospectos&grp=todos', '/prospeccao?tab=prospectos&grp=manual', '/prospeccao?tab=prospectos&grp=clinica-de-estetica--campinas'];
const CLIENT_PAGES = ['/cliente', '/cliente/projetos', '/cliente/aprovacoes', '/cliente/calendario', '/cliente/solicitacoes', '/cliente/documentos', '/cliente/contratos'];

let fails = 0;
const hit = async (who, path) => {
  const r = await fetch(`http://127.0.0.1:${APP}${path}`, { headers: { cookie: cookie(U[who]) }, redirect: 'manual' });
  const html = r.status === 200 ? await r.text() : '';
  const bad = r.status >= 500 || /Application error|Internal Server Error/i.test(html);
  if (bad) { fails++; console.error(`✗ [${who}] ${path} → ${r.status}`); } else console.log(`✓ [${who}] ${path} → ${r.status}${r.status >= 300 ? ' → ' + r.headers.get('location') : ''}`);
  return { r, html };
};
for (const p of STAFF_PAGES) await hit('admin', p);
// ids reais para páginas de detalhe
const { data } = await (await fetch(`http://127.0.0.1:${PGRST.port}/leads?select=id&limit=1`, { headers: { authorization: `Bearer ${jwt(U.admin)}` } })).json().then((d) => ({ data: d }));
for (const [tbl, base] of [['leads', '/crm/'], ['clients', '/clientes/'], ['proposals', '/propostas/'], ['contracts', '/contratos/'], ['projects', '/projetos/'], ['tasks', '/projetos/tarefas/'], ['prospects', '/prospeccao/']]) {
  const rows = await (await fetch(`http://127.0.0.1:${PGRST.port}/${tbl}?select=id&limit=1`, { headers: { authorization: `Bearer ${jwt(U.admin)}` } })).json();
  if (rows[0]) { await hit('admin', base + rows[0].id); if (tbl === 'proposals') await hit('admin', `${base}${rows[0].id}/preview`); if (tbl === 'contracts') await hit('admin', `${base}${rows[0].id}/imprimir`); }
}
const cl = await (await fetch(`http://127.0.0.1:${PGRST.port}/clients?select=id&limit=1`, { headers: { authorization: `Bearer ${jwt(U.admin)}` } })).json();
if (cl[0]) { await hit('admin', `/brand/${cl[0].id}`); for (const t of ['arquivos', 'regras', 'conhecimento']) await hit('admin', `/brand/${cl[0].id}?tab=${t}`); await hit('admin', `/clientes/${cl[0].id}?tab=financeiro`); }
for (const who of ['comercial', 'financeiro', 'designer']) for (const p of ['/dashboard', '/crm', '/financeiro', '/projetos', '/brand', '/prospeccao']) await hit(who, p);
for (const p of CLIENT_PAGES) await hit('cliente', p);
// cliente não acessa área da equipe (redireciona ao portal)
const x = await hit('cliente', '/financeiro'); if (!String(x.r.headers.get('location')).includes('/cliente')) { fails++; console.error('✗ cliente deveria ser redirecionado de /financeiro ao portal'); }

process.kill(-app.pid, 'SIGTERM'); fake.close();
if (fails) { console.error(`\n${fails} falha(s)\n--- log do app ---\n${log.split('\n').filter((l) => /rror/.test(l)).slice(0, 15).join('\n')}`); process.exit(1); }
console.log('\nTodas as páginas abriram sem erro'); process.exit(0);
