import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Tabs, Empty, Field, Stat } from '@/components/ui';
import { LinkButton } from '@/components/LinkButton';
import { SubmitButton } from '@/components/SubmitButton';
import { DocUploader } from './DocUploader';
import { AccessForm } from './AccessForm';
import { removeUser } from '../configuracoes/remove-user-action';
import { appUrl } from '@/lib/app-url';
import { deleteClientDoc, respondRequest } from './actions';
import { REQUEST_KIND, REQUEST_STATUS } from '@/lib/domain';
import { dateTimeBR } from '@/lib/format';

export const metadata = { title: 'Portal do Cliente — gestão' };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function PortalGestao({ searchParams }: { searchParams: Promise<{ tab?: string; email?: string; name?: string; c?: string; mode?: string }> }) {
  const { supabase, profile } = await requireModule('portal');
  const sp = await searchParams;
  const tab = ['solicitacoes', 'documentos', 'acessos'].includes(sp.tab ?? '') ? sp.tab! : 'solicitacoes';
  const [{ data: reqs }, { data: clients }, { data: docs }, { data: users }, { data: contacts }] = await Promise.all([
    supabase.from('client_requests').select('id, kind, subject, body, status, response, created_at, clients(name)').order('created_at', { ascending: false }).limit(200),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('client_documents').select('id, name, category, created_at, clients(name)').order('created_at', { ascending: false }).limit(200),
    supabase.from('profiles').select('id, full_name, email, active, client_id, clients!profiles_client_fk(name)').eq('role', 'cliente').order('created_at'),
    supabase.from('client_contacts').select('id, client_id, name, email, role_title').order('is_primary', { ascending: false }).order('name'),
  ]);
  const open = reqs?.filter((r) => r.status !== 'resolvida').length ?? 0;
  return (
    <>
      <PageHeader title="Portal do Cliente" subtitle="Gestão do que o cliente vê e envia. O cliente acessa em /cliente com o login individual dele." actions={<LinkButton href="/portal/visualizar" className="btn btn-primary">Ver como o cliente</LinkButton>} />
      <section className="mb-8 grid gap-4 sm:grid-cols-3"><Stat label="Solicitações abertas" value={open} tone={open ? 'lime' : undefined} /><Stat label="Documentos publicados" value={docs?.length ?? 0} /><Stat label="Acessos de clientes" value={users?.filter((u) => u.active && u.client_id).length ?? 0} /></section>
      <Tabs current={tab} items={[{ key: 'solicitacoes', label: 'Solicitações e briefings', href: '/portal' }, { key: 'documentos', label: 'Documentos publicados', href: '/portal?tab=documentos' }, { key: 'acessos', label: 'Acessos e visibilidade', href: '/portal?tab=acessos' }]} />

      {tab === 'solicitacoes' && (!reqs?.length ? <Empty title="Nenhuma solicitação" text="Briefings e pedidos enviados pelos clientes no portal aparecem aqui." /> : (
        <div className="space-y-4">{reqs.map((r) => (
          <article key={r.id} className="card"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-medium">{r.subject}</div><div className="text-xs text-muted">{one(r.clients)?.name} · {REQUEST_KIND[r.kind]} · {dateTimeBR(r.created_at)}</div></div><span className="badge">{REQUEST_STATUS[r.status]}</span></div>
            <p className="mt-3 whitespace-pre-line text-sm">{r.body}</p>
            <form action={respondRequest.bind(null, r.id)} className="mt-4 space-y-3 border-t border-line pt-4"><Field label="Resposta ao cliente (visível no portal)"><textarea name="response" rows={2} defaultValue={r.response ?? ''} className="input" /></Field>
              <div className="flex flex-wrap items-center gap-2"><select name="status" defaultValue={r.status} className="input !w-44" aria-label="Status">{Object.entries(REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><SubmitButton className="btn btn-sm btn-dark" pendingText="…">Salvar</SubmitButton></div></form></article>))}</div>))}

      {tab === 'documentos' && (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <div>{!docs?.length ? <Empty title="Nenhum documento publicado" /> : <div className="card divide-y divide-line !p-0">{docs.map((d) => (<div key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><div><div className="font-medium">{d.name}</div><div className="text-xs text-muted">{one(d.clients)?.name} · {d.category} · {dateTimeBR(d.created_at)}</div></div>
            <form action={deleteClientDoc.bind(null, d.id)}><SubmitButton className="btn btn-sm text-danger" pendingText="…" confirm="Remover este documento do portal?">Remover</SubmitButton></form></div>))}</div>}</div>
          <DocUploader clients={clients ?? []} />
        </div>)}

      {tab === 'acessos' && (
        <div className="space-y-6">
          {profile.role === 'admin' ? <AccessForm clients={clients ?? []} contacts={contacts ?? []} loginUrl={`${appUrl().replace(/\/$/, '')}/login`} defaults={{ email: sp.email, name: sp.name, client: sp.c, mode: sp.mode }} /> : <div className="card text-sm text-muted">Somente administradores geram links de acesso. Peça a um administrador.</div>}
          <div className="card text-sm"><h2 className="mb-2 text-base font-semibold">Como funciona o acesso do cliente</h2><ol className="list-decimal space-y-1.5 pl-5 text-muted">
            <li>Preencha o formulário acima: o sistema cria o login, vincula à empresa e entrega um <b>link</b> (a pessoa cria a senha) ou <b>login e senha</b>. Repita para cada usuário da empresa.</li>
            <li>O cliente abre o link, clica em <b>Entrar</b> e define a senha. Nas próximas vezes entra em <code>/login</code> com e-mail e senha.</li>
            <li>Ele cai direto no <b>Quadro</b> e vê somente o que você liberar.</li></ol>
            <h3 className="mb-1 mt-5 font-medium">O que o cliente enxerga</h3><ul className="list-disc space-y-1 pl-5 text-muted"><li><b>Projetos</b> marcados como “Visível no Portal” e, neles, as tarefas que <b>não</b> são internas (nunca o briefing interno).</li><li><b>Aprovações</b>: tarefas no status “Enviado ao cliente”, com os arquivos marcados como visíveis.</li><li>Arquivos finais só depois de aprovados; documentos que você publica aqui; propostas liberadas; contratos enviados/assinados.</li></ul></div>
          <section className="card"><h2 className="mb-4 text-base font-semibold">Usuários de clientes</h2>
            {!users?.length ? <p className="text-sm text-muted">Nenhum usuário com perfil Cliente ainda.</p> : <table className="w-full text-sm"><tbody>{users.map((u) => (<tr key={u.id} className="border-b border-line last:border-0"><td className="py-2.5">{u.full_name || u.email}<div className="text-xs text-muted">{u.email}</div></td><td className="py-2.5">{one(u.clients)?.name ?? <span className="text-danger">sem empresa vinculada</span>}</td><td className="py-2.5 text-right"><span className="badge">{u.active ? 'ativo' : 'inativo'}</span>{profile.role === 'admin' && u.client_id && <Link href={`/portal?tab=acessos&email=${encodeURIComponent(u.email ?? '')}&name=${encodeURIComponent(u.full_name ?? '')}&c=${u.client_id}`} className="ml-3 text-xs underline">Novo link</Link>}{profile.role === 'admin' && u.client_id && <Link href={`/portal?tab=acessos&mode=senha&email=${encodeURIComponent(u.email ?? '')}&name=${encodeURIComponent(u.full_name ?? '')}&c=${u.client_id}`} className="ml-3 text-xs underline">Nova senha</Link>}{profile.role === 'admin' && <form action={removeUser.bind(null, u.id)} className="ml-3 inline"><input type="hidden" name="tab" value="portal" /><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm={`Remover ${u.email}? O acesso dessa pessoa ao portal será encerrado.`}>Remover</SubmitButton></form>}</td></tr>))}</tbody></table>}
            {profile.role === 'admin' && <p className="mt-3 text-xs text-muted">Para alterar vínculo ou desativar, use Configurações.</p>}</section>
        </div>)}
    </>
  );
}
