import Link from 'next/link';
import { ArrowUpRight, CalendarClock, CheckCircle2, FileText, FolderKanban, Megaphone, Palette, ShieldCheck } from 'lucide-react';
import { Empty, Stat } from '@/components/ui';
import { LinkButton } from '@/components/LinkButton';
import { dateBR, dateTimeBR, money } from '@/lib/format';
import { CONTRACT_STATUS, PROJECT_STATUS, PROPOSAL_STATUS, TASK_STATUS } from '@/lib/domain';
import { AREAS } from '@/lib/projects/board';
import { ASSET_CATEGORY } from '@/lib/brand';

type Nullable = string | null;
export interface Client360Project { id: string; name: string; status: string; due_on: Nullable; starts_on?: Nullable }
export interface Client360Task {
  id: string; title: string; status: string; due_on: Nullable; review_due_on: Nullable;
  area: Nullable; project_id: string; created_at: string;
}
export interface Client360Contract {
  id: string; number: number; title: string; status: string; starts_on: Nullable; ends_on: Nullable;
  readjust_on: Nullable; signed_at: Nullable;
}
export interface Client360Proposal { id: string; number: number; title: string; status: string; total_value: number }
export interface Client360Service { id: string; service: string; status: string; billing: string; value: number }
export interface Client360Color { id: string; name: string; hex: string; role: string }
export interface Client360Font { id: string; name: string; usage: string }
export interface Client360Asset { id: string; name: string; category: string; created_at: string }
export interface Client360Document { id: string; name: string; category: string; created_at: string }
export interface Client360Request { id: string; subject: string; status: string; created_at: string }
export interface Client360Event { id: number; task_id: string; kind: string; detail: string | null; created_at: string }
export interface Client360Brand {
  tone_of_voice: Nullable; design_rules: Nullable; restrictions: Nullable;
  ai_instructions: Nullable;
}

export interface Client360Data {
  id: string;
  client: { name: string; status: string; segment: Nullable; notes: Nullable; website: Nullable };
  role: string;
  today: string;
  ownerName: string | null;
  projects: Client360Project[];
  tasks: Client360Task[];
  contracts: Client360Contract[];
  proposals: Client360Proposal[];
  services: Client360Service[];
  brandProfile: Client360Brand | null;
  colors: Client360Color[];
  fonts: Client360Font[];
  assets: Client360Asset[];
  documents: Client360Document[];
  requests: Client360Request[];
  events: Client360Event[];
  loadErrors: string[];
}

const ACTIVE_TASK = new Set(['solicitada', 'aguardando_cliente', 'a_fazer', 'em_andamento', 'produzido', 'enviado', 'ajustes']);
const CLOSED_PROJECT = new Set(['cancelado', 'concluido']);
const statusBadge = (status: string, label?: string) => (
  <span className="badge whitespace-nowrap">{label ?? status.replaceAll('_', ' ')}</span>
);

function SectionHeader({ title, subtitle, href, action }: { title: string; subtitle?: string; href?: string; action?: string }) {
  return <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
    <div><h2 className="text-base font-semibold">{title}</h2>{subtitle && <p className="mt-1 text-xs text-muted">{subtitle}</p>}</div>
    {href && <Link href={href} className="text-sm font-medium underline underline-offset-4 hover:opacity-70">{action ?? 'Ver tudo'}</Link>}
  </div>;
}

function Shortcut({ href, label, description, icon: Icon }: {
  href: string; label: string; description: string; icon: typeof FileText;
}) {
  return <Link href={href} className="group flex items-center gap-3 rounded-xl border border-line p-4 transition hover:border-fg/40 hover:bg-subtle/60">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-subtle"><Icon className="h-5 w-5" strokeWidth={1.5} /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs text-muted">{description}</span></span>
    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted group-hover:text-fg" />
  </Link>;
}

export function Client360Overview(props: Client360Data) {
  const { id, client, role, today, ownerName, projects, tasks, contracts, requests, documents, services, loadErrors } = props;
  const signed = contracts.filter((c) => c.status === 'assinado');
  const liveProjects = projects.filter((p) => !CLOSED_PROJECT.has(p.status));
  const liveTasks = tasks.filter((t) => ACTIVE_TASK.has(t.status));
  const overdue = liveTasks.filter((t) => !!t.due_on && t.due_on < today);
  const awaiting = liveTasks.filter((t) => t.status === 'produzido' || t.status === 'enviado').length;
  const upcoming = liveTasks.filter((t) => t.due_on).sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? '')).slice(0, 6);
  const canBrand = ['admin', 'comercial', 'designer', 'trafego'].includes(role);
  const canPortal = role === 'admin' || role === 'comercial';
  const canSales = ['admin', 'comercial', 'financeiro'].includes(role);
  const seeFin = ['admin', 'financeiro'].includes(role);

  return <div className="space-y-6">
    {loadErrors.length > 0 && (
      <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-warn">
        Algumas informações não puderam ser carregadas ({loadErrors.join(', ')}). Consulte os módulos de origem antes de tomar decisões.
      </p>
    )}
    <section aria-label="Resumo operacional" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Projetos em andamento" value={liveProjects.length} />
      <Stat label="Tarefas ativas" value={liveTasks.length} />
      <Stat label="Prazos atrasados" value={overdue.length} tone={overdue.length ? 'danger' : undefined} />
      <Stat label="Em aprovação" value={awaiting} />
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <section className="card">
        <SectionHeader title="Próximas entregas e prioridades" subtitle="Tarefas vinculadas aos projetos deste cliente" href={'/projetos?view=lista&client=' + id} action="Abrir produção" />
        {upcoming.length ? <ul className="divide-y divide-line">
          {upcoming.map((t) => <li key={t.id}><Link href={'/projetos/tarefas/' + t.id} className="flex items-start justify-between gap-4 py-3 hover:underline">
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{t.title}</span>
              <span className="mt-1 block text-xs text-muted">{TASK_STATUS[t.status]?.label ?? t.status}</span></span>
            <span className={'shrink-0 text-xs ' + (t.due_on && t.due_on < today ? 'font-semibold text-danger' : 'text-muted')}>
              {dateBR(t.due_on)}
            </span>
          </Link></li>)}
        </ul> : <p className="py-6 text-sm text-muted">Nenhuma tarefa ativa com data de entrega cadastrada.</p>}
      </section>

      <section className="card">
        <SectionHeader title="Relacionamento com o cliente" subtitle="Informações extraídas do cadastro único" />
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">Situação</dt><dd className="font-medium capitalize">{client.status}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Responsável na Muvens</dt><dd className="text-right font-medium">{ownerName ?? 'Não atribuído'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Segmento</dt><dd className="text-right font-medium">{client.segment || 'Não informado'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Contratos assinados</dt><dd className="font-medium">{canSales ? signed.length : 'Acesso restrito'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Solicitações em aberto</dt><dd className="font-medium">{canPortal ? requests.filter((r) => r.status !== 'resolvida').length : 'Acesso restrito'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Arquivos do portal</dt><dd className="font-medium">{canPortal ? documents.length : 'Acesso restrito'}</dd></div>
        </dl>
        {client.website && /^https?:\/\//i.test(client.website) &&
          <a href={client.website} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm underline underline-offset-4">Abrir site do cliente <ArrowUpRight className="ml-1 h-4 w-4" /></a>}
      </section>
    </div>

    <section>
      <h2 className="mb-3 text-base font-semibold">Acesso às áreas deste cliente</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Shortcut href={'/clientes/' + id + '?tab=operacao'} label="Projetos e conteúdos" description={liveProjects.length + ' projeto(s) ativo(s) · ' + liveTasks.length + ' tarefa(s) aberta(s)'} icon={FolderKanban} />
        {canSales && <Shortcut href={'/clientes/' + id + '?tab=comercial'} label="Contratos e serviços" description={signed.length + ' contrato(s) assinado(s) · ' + services.filter((s) => s.status === 'ativo').length + ' serviço(s) ativo(s)'} icon={FileText} />}
        {canBrand && <Shortcut href={'/clientes/' + id + '?tab=marca'} label="Marca e estratégia" description="Identidade visual, regras e referências" icon={Palette} />}
        {canPortal && <Shortcut href={'/clientes/' + id + '?tab=portal'} label="Portal e documentos" description="Documentos e solicitações do cliente" icon={ShieldCheck} />}
        {seeFin && <Shortcut href={'/clientes/' + id + '?tab=financeiro'} label="Financeiro" description="Cobranças e pagamentos deste cliente" icon={CalendarClock} />}
        <Shortcut href={'/clientes/' + id + '?tab=historico'} label="Histórico de trabalho" description="Registros de produção e solicitações" icon={CheckCircle2} />
      </div>
    </section>
  </div>;
}

export function Client360Operation({ id, projects, tasks, today }: Client360Data) {
  const social = tasks.filter((t) => t.area === 'social_media');
  const pending = tasks.filter((t) => ACTIVE_TASK.has(t.status));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  return <div className="space-y-6">
    <section className="card">
      <SectionHeader title="Projetos do cliente" subtitle="Os dados são os mesmos do módulo Projetos e Tarefas" href={'/projetos?view=projetos&client=' + id} action="Abrir todos os projetos" />
      {!projects.length ? <Empty title="Nenhum projeto vinculado" text="Ao criar um projeto associado a este cadastro, ele aparecerá automaticamente aqui." /> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line">
          <th className="th">Projeto</th><th className="th">Situação</th><th className="th">Prazo</th><th className="th">Tarefas</th>
        </tr></thead><tbody>{projects.map((p) => <tr key={p.id} className="border-b border-line last:border-0">
          <td className="td"><Link href={'/projetos/' + p.id} className="font-medium underline-offset-4 hover:underline">{p.name}</Link></td>
          <td className="td">{statusBadge(p.status, PROJECT_STATUS[p.status] ?? p.status)}</td>
          <td className="td">{dateBR(p.due_on)}</td>
          <td className="td">{tasks.filter((t) => t.project_id === p.id && ACTIVE_TASK.has(t.status)).length} ativas</td>
        </tr>)}</tbody></table></div>}
    </section>

    <section className="card">
      <SectionHeader title="Tarefas e entregáveis" subtitle="Em execução, revisão e aprovação" href={'/projetos?view=lista&client=' + id} action="Ver quadro completo" />
      {!pending.length ? <Empty title="Nenhuma tarefa aberta" text="As tarefas aparecerão aqui quando vinculadas a projetos deste cliente." /> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line">
          <th className="th">Tarefa</th><th className="th">Projeto</th><th className="th">Etapa</th><th className="th">Prazo</th>
        </tr></thead><tbody>{pending.slice(0, 40).map((t) => <tr key={t.id} className="border-b border-line last:border-0">
          <td className="td"><Link href={'/projetos/tarefas/' + t.id} className="font-medium underline-offset-4 hover:underline">{t.title}</Link></td>
          <td className="td text-muted">{projectName.get(t.project_id) ?? '—'}</td>
          <td className="td">{statusBadge(t.status, TASK_STATUS[t.status]?.label)}</td>
          <td className={'td ' + (t.due_on && t.due_on < today ? 'text-danger' : 'text-muted')}>{dateBR(t.due_on)}</td>
        </tr>)}</tbody></table>
        {pending.length > 40 && <p className="px-4 py-3 text-xs text-muted">Mostrando 40 tarefas; consulte o quadro completo.</p>}</div>}
    </section>

    <section className="card">
      <SectionHeader title="Conteúdos e Social Media" subtitle="Visão das tarefas classificadas como Social Media, sem confundir com um calendário editorial publicado" href={'/projetos?view=kanban&client=' + id} action="Abrir produção" />
      {social.length ? <ul className="divide-y divide-line">{social.slice(0, 12).map((t) =>
        <li key={t.id}><Link href={'/projetos/tarefas/' + t.id} className="flex items-start justify-between gap-3 py-3 text-sm hover:underline">
          <span><span className="font-medium">{t.title}</span><span className="mt-1 block text-xs text-muted">{TASK_STATUS[t.status]?.label ?? t.status}</span></span>
          <span className="shrink-0 text-xs text-muted">{dateBR(t.due_on)}</span>
        </Link></li>)}</ul> : <p className="text-sm text-muted">Nenhuma tarefa classificada como Social Media neste cliente.</p>}
      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        Planejamento por canal, copy, arte, data de publicação e link publicado ainda será implementado na etapa de calendário editorial.
      </p>
    </section>
    <section className="card flex flex-wrap items-center justify-between gap-4">
      <div><div className="flex items-center gap-2 font-medium"><Megaphone className="h-4 w-4" /> Tráfego pago</div>
        <p className="mt-1 text-sm text-muted">Os dados do Meta Ads e Google Ads ainda não estão conectados; nenhuma métrica é simulada.</p></div>
      <span className="badge">Integração pendente</span>
    </section>
  </div>;
}

export function Client360Commercial({ id, contracts, proposals, services, role, today }: Client360Data) {
  const canValues = role === 'admin' || role === 'financeiro';
  return <div className="space-y-6">
    <section className="card">
      <SectionHeader title="Contratos" subtitle="Situação contratual, vigência e reajustes reais" href="/contratos" action="Gerenciar contratos" />
      {!contracts.length ? <Empty title="Nenhum contrato associado" text="Quando um contrato for vinculado a este cliente, aparecerá aqui." /> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-line">
          <th className="th">Contrato</th><th className="th">Status</th><th className="th">Vigência</th><th className="th">Reajuste</th>
        </tr></thead><tbody>{contracts.map((c) => <tr key={c.id} className="border-b border-line last:border-0">
          <td className="td"><Link href={'/contratos/' + c.id} className="font-medium underline-offset-4 hover:underline">#{c.number} · {c.title}</Link></td>
          <td className="td"><span className={'badge ' + (CONTRACT_STATUS[c.status]?.tone ?? '')}>{CONTRACT_STATUS[c.status]?.label ?? c.status}</span></td>
          <td className="td">{dateBR(c.starts_on)} — {dateBR(c.ends_on)}</td>
          <td className={'td ' + (c.readjust_on && c.readjust_on < today ? 'text-warn' : 'text-muted')}>{dateBR(c.readjust_on)}</td>
        </tr>)}</tbody></table></div>}
    </section>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="card">
        <SectionHeader title="Serviços contratados" subtitle="Cobrança e situação comercial" href={'/clientes/' + id + '?tab=servicos'} action="Ver ou editar serviços" />
        {!services.length ? <p className="text-sm text-muted">Nenhum serviço associado.</p> :
          <ul className="divide-y divide-line">{services.slice(0, 10).map((s) => <li key={s.id} className="flex items-start justify-between gap-3 py-3 text-sm">
            <div><span className="font-medium">{s.service}</span><div className="mt-0.5 text-xs text-muted">{s.billing === 'mensal' ? 'Mensal' : 'Pontual'} · {s.status}</div></div>
            {canValues && <span className="whitespace-nowrap font-medium">{money(s.value)}</span>}
          </li>)}</ul>}
      </section>
      <section className="card">
        <SectionHeader title="Propostas" subtitle="Negociações e histórico de propostas" href={'/clientes/' + id + '?tab=propostas'} action="Ver propostas" />
        {!proposals.length ? <p className="text-sm text-muted">Nenhuma proposta associada.</p> :
          <ul className="divide-y divide-line">{proposals.slice(0, 10).map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <Link href={'/propostas/' + p.id} className="font-medium underline-offset-4 hover:underline">#{p.number} · {p.title}</Link>
            <span className="shrink-0 text-xs text-muted">{PROPOSAL_STATUS[p.status]?.label ?? p.status}</span>
          </li>)}</ul>}
      </section>
    </div>
  </div>;
}

export function Client360BrandSection({ id, client, brandProfile, colors, fonts, assets }: Client360Data) {
  return <div className="space-y-6">
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="card">
        <SectionHeader title="Estratégia e posicionamento" subtitle="Informações já cadastradas; não é uma estratégia gerada automaticamente" />
        <div className="space-y-4 text-sm">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted">Segmento</div><p className="mt-1">{client.segment || 'Não cadastrado'}</p></div>
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted">Observações do cliente</div><p className="mt-1 whitespace-pre-wrap">{client.notes || 'Nenhuma observação cadastrada.'}</p></div>
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted">Tom de voz</div><p className="mt-1 whitespace-pre-wrap">{brandProfile?.tone_of_voice || 'Não definido no Brand Center.'}</p></div>
        </div>
        <p className="mt-5 border-t border-line pt-3 text-xs text-muted">Campos específicos para objetivos, público-alvo e planejamento estratégico poderão ser adicionados na próxima fase.</p>
      </section>
      <section className="card">
        <SectionHeader title="Regras da marca" subtitle="Diretrizes registradas no Brand Center" href={'/brand/' + id} action="Editar no Brand Center" />
        <div className="space-y-4 text-sm">
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted">Regras de design</div><p className="mt-1 whitespace-pre-wrap">{brandProfile?.design_rules || 'Não cadastradas.'}</p></div>
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted">Restrições</div><p className="mt-1 whitespace-pre-wrap">{brandProfile?.restrictions || 'Não cadastradas.'}</p></div>
          <div><div className="text-xs font-semibold uppercase tracking-wide text-muted">Orientações para IA</div><p className="mt-1 whitespace-pre-wrap">{brandProfile?.ai_instructions || 'Não cadastradas.'}</p></div>
        </div>
      </section>
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="card">
        <SectionHeader title="Paleta de cores" href={'/brand/' + id} action="Ver identidade" />
        {!colors.length ? <p className="text-sm text-muted">Nenhuma cor cadastrada.</p> :
          <div className="grid grid-cols-2 gap-3">{colors.map((c) => <div key={c.id} className="flex items-center gap-2">
            <span className="h-9 w-9 shrink-0 rounded-lg border border-line" style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#777777' }} />
            <div className="min-w-0"><div className="truncate text-xs font-medium">{c.name}</div><div className="font-mono text-[11px] text-muted">{c.hex}</div></div>
          </div>)}</div>}
      </section>
      <section className="card">
        <SectionHeader title="Tipografia" href={'/brand/' + id} action="Ver fontes" />
        {!fonts.length ? <p className="text-sm text-muted">Nenhuma fonte cadastrada.</p> :
          <ul className="space-y-3">{fonts.map((f) => <li key={f.id} className="flex justify-between gap-2 text-sm">
            <span className="font-medium">{f.name}</span><span className="text-xs text-muted">{f.usage}</span>
          </li>)}</ul>}
      </section>
    </div>
    <section className="card">
      <SectionHeader title="Arquivos de marca" subtitle="Categorias e nomes dos arquivos; os downloads continuam protegidos pelo Brand Center" href={'/brand/' + id + '?tab=arquivos'} action="Abrir arquivos" />
      {!assets.length ? <p className="text-sm text-muted">Nenhum arquivo cadastrado neste Brand Center.</p> :
        <div className="grid gap-2 sm:grid-cols-2">{assets.slice(0, 12).map((a) => <div key={a.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate">{a.name}</span>
          <span className="shrink-0 text-[11px] text-muted">{ASSET_CATEGORY[a.category] ?? a.category}</span>
        </div>)}</div>}
      {assets.length > 12 && <p className="mt-3 text-xs text-muted">Exibindo 12 arquivos. Veja os demais no Brand Center.</p>}
    </section>
  </div>;
}

export function Client360Portal({ id, role, documents, requests }: Client360Data) {
  const allowed = role === 'admin' || role === 'comercial';
  if (!allowed) return <Empty title="Área restrita" text="Gestão de documentos e solicitações é acessível somente aos perfis autorizados." />;
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="card">
      <SectionHeader title="Documentos compartilhados" subtitle="Arquivos publicados no portal; downloads exigem autorização" href="/portal?tab=documentos" action="Gerenciar documentos" />
      {!documents.length ? <p className="text-sm text-muted">Nenhum documento publicado para este cliente.</p> :
        <ul className="divide-y divide-line">{documents.map((d) => <li key={d.id} className="flex gap-3 py-3 text-sm">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <div><div className="font-medium">{d.name}</div><div className="mt-0.5 text-xs text-muted">{d.category} · {dateBR(d.created_at)}</div></div>
        </li>)}</ul>}
    </section>
    <section className="card">
      <SectionHeader title="Solicitações e briefings" subtitle="Pedidos recebidos pelo Portal do Cliente" href="/portal" action="Abrir solicitações" />
      {!requests.length ? <p className="text-sm text-muted">Nenhuma solicitação registrada para este cliente.</p> :
        <ul className="divide-y divide-line">{requests.map((r) => <li key={r.id} className="flex items-start justify-between gap-3 py-3 text-sm">
          <div><div className="font-medium">{r.subject}</div><div className="mt-1 text-xs text-muted">{dateTimeBR(r.created_at)}</div></div>
          {statusBadge(r.status)}
        </li>)}</ul>}
    </section>
  </div>;
}

export function Client360History({ tasks, events, requests }: Client360Data) {
  const names = new Map(tasks.map((t) => [t.id, t.title]));
  const timeline = [
    ...events.map((e) => ({
      key: 'event-' + e.id, date: e.created_at,
      title: names.get(e.task_id) ?? 'Tarefa atualizada',
      detail: [e.kind.replaceAll('_', ' '), e.detail].filter(Boolean).join(' · '),
      href: '/projetos/tarefas/' + e.task_id,
    })),
    ...requests.map((r) => ({
      key: 'request-' + r.id, date: r.created_at, title: r.subject,
      detail: 'Solicitação do cliente · ' + r.status.replaceAll('_', ' '),
      href: '/portal',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  return <section className="card">
    <SectionHeader title="Histórico de produção e solicitações" subtitle="Eventos das tarefas e pedidos do portal associados a este cliente. Não inclui todas as alterações cadastrais." />
    {!timeline.length ? <Empty title="Nenhuma atividade registrada" text="Atualizações de tarefas e solicitações aparecerão aqui quando forem registradas." /> :
      <ol className="relative ml-2 border-l border-line pl-6">
        {timeline.map((entry) => <li key={entry.key} className="relative mb-6 last:mb-0">
          <span className="absolute -left-[30px] top-1 h-3 w-3 rounded-full border-2 border-surface bg-lime" />
          <div className="text-xs text-muted">{dateTimeBR(entry.date)}</div>
          <Link href={entry.href} className="mt-1 block text-sm font-semibold underline-offset-4 hover:underline">{entry.title}</Link>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{entry.detail || 'Atualização registrada'}</p>
        </li>)}
      </ol>}
  </section>;
}
