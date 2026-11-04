import Link from 'next/link';
import { COLUMNS, adjustedDue, columnOf, lateness, peopleOf, timelineRange, type BoardTask } from '@/lib/projects/board';
import { CLIENT_TASK_STATUS } from '@/lib/domain';
import { dateBR } from '@/lib/format';

const COL_TONE: Record<string, string> = { diagramacao: 'bg-violet-500', social_media: 'bg-pink-500', outro: 'bg-muted', andamento: 'bg-blue-500', aprovacao: 'bg-amber-500', ajustes: 'bg-danger', aprovados: 'bg-lime', finalizados: 'bg-ok' };
const ago = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

function LateBadge({ t, today, viewer }: { t: BoardTask; today: string; viewer: 'cliente' | 'equipe' }) {
  const l = lateness(t, today);
  if (!l.late) return null;
  const mine = l.side === viewer;
  return <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">{l.what} {mine ? 'atrasada' : 'em atraso'} há {ago(l.days)}</span>;
}

export function Card({ t, href, today, viewer, showProject }: { t: BoardTask; href: string; today: string; viewer: 'cliente' | 'equipe'; showProject: boolean }) {
  const st = CLIENT_TASK_STATUS[t.status];
  const waiting = t.status === 'aguardando_cliente' || t.status === 'enviado';
  return (
    <article className={`rounded-xl border bg-surface p-3.5 ${waiting && viewer === 'cliente' ? 'border-amber-500/50' : 'border-line'}`}>
      <Link href={href} className="text-sm font-medium hover:underline">{t.title}</Link>
      {showProject && <div className="mt-0.5 text-xs text-muted">{t.project}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {t.service && <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">{t.service}</span>}
        {(t.status === 'solicitada' || t.status === 'aguardando_cliente' || t.status === 'enviado') && st && <span className={`badge ${st.tone}`}>{st.label}</span>}
        <LateBadge t={t} today={today} viewer={viewer} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{t.due_on ? (adjustedDue(t) !== t.due_on ? `Entrega prevista ${dateBR(adjustedDue(t))}` : `Entrega ${dateBR(t.due_on)}`) : 'Sem data de entrega'}</span>
        <span className="flex items-center gap-2">{t.links > 0 && <span title="Links">🔗 {t.links}</span>}{t.comments > 0 && <span title="Mensagens">💬 {t.comments}</span>}</span>
      </div>
      {peopleOf(t).length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">{peopleOf(t).slice(0, 3).map((n) => <span key={n} className="inline-flex items-center gap-1"><span className="grid h-5 w-5 place-items-center rounded-full bg-fg text-[10px] font-bold text-lime">{n.trim().charAt(0).toUpperCase()}</span>{n.split(' ')[0]}</span>)}{peopleOf(t).length > 3 && <span className="text-muted">+{peopleOf(t).length - 3}</span>}</div>}
      {(t.contacts?.length ?? 0) > 0 && <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted" title="Contatos do cliente nesta demanda">{t.contacts!.slice(0, 2).map((c) => <span key={c.name} className="inline-flex items-center gap-1"><span className="grid h-5 w-5 place-items-center rounded-full border border-line text-[10px] font-bold text-fg">{c.name.trim().charAt(0).toUpperCase()}</span>{c.name.split(' ')[0]}</span>)}{t.contacts!.length > 2 && <span>+{t.contacts!.length - 2}</span>}</div>}
    </article>
  );
}

export function KanbanView({ tasks, today, hrefFor, viewer, showProject }: { tasks: BoardTask[]; today: string; hrefFor: (id: string) => string; viewer: 'cliente' | 'equipe'; showProject: boolean }) {
  const cols = COLUMNS.filter((c) => c.key !== 'outro' || tasks.some((t) => columnOf(t) === 'outro'));
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {cols.map((c) => {
        const items = tasks.filter((t) => columnOf(t) === c.key).sort((a, b) => lateness(b, today).days - lateness(a, today).days);
        return (
          <section key={c.key} aria-label={c.label} className="w-64 shrink-0 rounded-2xl border border-line bg-subtle/50 p-3">
            <header className="mb-3 flex items-center justify-between px-1.5"><h3 className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${COL_TONE[c.key]}`} />{c.label}</h3><span className="text-xs text-muted">{items.length}</span></header>
            <div className="space-y-2.5">{items.map((t) => <Card key={t.id} t={t} href={hrefFor(t.id)} today={today} viewer={viewer} showProject={showProject} />)}{!items.length && <p className="px-1.5 py-6 text-center text-xs text-muted">—</p>}</div>
          </section>);
      })}
    </div>
  );
}

export function TimelineView({ tasks, today, hrefFor }: { tasks: BoardTask[]; today: string; hrefFor: (id: string) => string }) {
  const dated = tasks.filter((t) => t.starts_on || t.due_on), undated = tasks.filter((t) => !t.starts_on && !t.due_on);
  if (!dated.length) return <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">Nenhuma demanda com datas para mostrar na linha do tempo.</div>;
  const r = timelineRange(dated.map((t) => ({ starts_on: t.starts_on, due_on: adjustedDue(t) })), today);
  const projects = [...new Set(dated.map((t) => t.project))];
  return (
    <div className="card overflow-x-auto !p-0">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[14rem_1fr] border-b border-line text-xs text-muted">
          <div className="px-4 py-2">Demanda</div>
          <div className="relative h-8">{r.ticks.map((k) => <span key={k.label + k.left} className="absolute top-2 -translate-x-1/2" style={{ left: `${k.left}%` }}>{k.label}</span>)}</div>
        </div>
        {projects.map((p) => (
          <div key={p}>
            <div className="bg-subtle/60 px-4 py-1.5 text-xs font-semibold">{p}</div>
            {dated.filter((t) => t.project === p).map((t) => {
              const b = r.bar(t)!; const col = columnOf(t); const l = lateness(t, today);
              return (
                <div key={t.id} className="grid grid-cols-[14rem_1fr] items-center border-b border-line last:border-0">
                  <div className="min-w-0 px-4 py-2"><Link href={hrefFor(t.id)} className="block truncate text-sm hover:underline" title={t.title}>{t.title}</Link>{peopleOf(t).length > 0 && <div className="truncate text-xs text-muted" title={peopleOf(t).join(', ')}>{peopleOf(t).join(', ')}</div>}</div>
                  <div className="relative h-9">
                    {r.ticks.map((k) => <span key={k.label + k.left} className="absolute top-0 h-full w-px bg-line/60" style={{ left: `${k.left}%` }} />)}
                    <span className="absolute top-0 h-full w-0.5 bg-danger/70" style={{ left: `${r.todayLeft}%` }} title="Hoje" />
                    <span className={`absolute top-2.5 h-4 rounded-full ${l.late ? 'bg-danger' : COL_TONE[col]}`} style={{ left: `${b.left}%`, width: `${b.width}%` }} title={`${t.starts_on ? dateBR(t.starts_on) : '—'} → ${t.due_on ? dateBR(t.due_on) : '—'}`} />
                    {adjustedDue(t) !== t.due_on && (() => { const e = r.bar({ starts_on: t.due_on, due_on: adjustedDue(t) }); return e ? <span className="absolute top-2.5 h-4 rounded-full border border-dashed border-danger/60 bg-danger/10" style={{ left: `${e.left}%`, width: `${e.width}%` }} title={`Entrega prevista ${dateBR(adjustedDue(t))} (+${Math.ceil(t.client_wait_days ?? 0)} dias de espera do cliente)`} /> : null; })()}
                    {t.review_due_on && t.status === 'enviado' && <span className="absolute top-1.5 h-6 w-1 rounded bg-amber-500" style={{ left: `${r.pos(t.review_due_on)}%` }} title={`Devolução da revisão: ${dateBR(t.review_due_on)}`} />}
                    {t.changes_due_on && t.status === 'ajustes' && <span className="absolute top-1.5 h-6 w-1 rounded bg-violet-500" style={{ left: `${r.pos(t.changes_due_on)}%` }} title={`Entrega das alterações: ${dateBR(t.changes_due_on)}`} />}
                  </div>
                </div>);
            })}
          </div>))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-muted"><span><span className="mr-1.5 inline-block h-2 w-4 rounded-full bg-blue-500" />Barra: início → entrega</span><span><span className="mr-1.5 inline-block h-3 w-1 rounded bg-amber-500" />Devolução da revisão</span><span><span className="mr-1.5 inline-block h-3 w-1 rounded bg-violet-500" />Entrega das alterações</span><span><span className="mr-1.5 inline-block h-2 w-4 rounded-full border border-dashed border-danger/60 bg-danger/10" />Empurrado pela espera do cliente</span><span><span className="mr-1.5 inline-block h-3 w-0.5 bg-danger" />Hoje</span></div>
      {!!undated.length && <div className="border-t border-line px-4 py-3 text-xs text-muted">Sem datas: {undated.map((t, i) => <span key={t.id}>{i ? ', ' : ''}<Link href={hrefFor(t.id)} className="underline">{t.title}</Link></span>)}</div>}
    </div>
  );
}

export function ListView({ tasks, today, hrefFor, viewer }: { tasks: BoardTask[]; today: string; hrefFor: (id: string) => string; viewer: 'cliente' | 'equipe' }) {
  if (!tasks.length) return <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">Nenhuma demanda.</div>;
  const colLabel = (t: BoardTask) => COLUMNS.find((c) => c.key === columnOf(t))!.label;
  return (
    <div className="card overflow-x-auto !p-0">
      <table className="w-full"><thead><tr className="border-b border-line"><th className="th">Demanda</th><th className="th">Etapa</th><th className="th">Início</th><th className="th">Entrega</th><th className="th">Revisão até</th><th className="th">Alterações até</th><th className="th">Responsável</th></tr></thead>
        <tbody>{tasks.map((t) => (
          <tr key={t.id} className="border-b border-line last:border-0 hover:bg-subtle/60">
            <td className="td"><Link href={hrefFor(t.id)} className="font-medium hover:underline">{t.title}</Link><div className="text-xs text-muted">{t.project}</div><div className="mt-1"><LateBadge t={t} today={today} viewer={viewer} /></div></td>
            <td className="td"><span className="badge">{colLabel(t)}</span></td>
            <td className="td whitespace-nowrap">{t.starts_on ? dateBR(t.starts_on) : '—'}</td><td className="td whitespace-nowrap">{t.due_on ? dateBR(t.due_on) : '—'}{adjustedDue(t) !== t.due_on && <div className="text-xs text-muted">prevista {dateBR(adjustedDue(t))} (+{Math.ceil(t.client_wait_days ?? 0)}d espera do cliente)</div>}</td>
            <td className="td whitespace-nowrap">{t.status === 'enviado' && t.review_due_on ? dateBR(t.review_due_on) : '—'}</td><td className="td whitespace-nowrap">{t.status === 'ajustes' && t.changes_due_on ? dateBR(t.changes_due_on) : '—'}</td>
            <td className="td">{peopleOf(t).join(', ') || '—'}</td></tr>))}</tbody></table>
    </div>
  );
}

export function CalendarView({ tasks, today, hrefFor }: { tasks: BoardTask[]; today: string; hrefFor: (id: string) => string }) {
  type Ev = { date: string; label: string; t: BoardTask; tone: string };
  const ev: Ev[] = tasks.flatMap((t) => [
    t.due_on && !['aprovado', 'entregue'].includes(t.status) ? { date: t.due_on, label: 'Entrega', t, tone: 'bg-blue-500/10 text-blue-600' } : null,
    t.review_due_on && t.status === 'enviado' ? { date: t.review_due_on, label: 'Devolução da revisão', t, tone: 'bg-amber-500/15 text-warn' } : null,
    t.changes_due_on && t.status === 'ajustes' ? { date: t.changes_due_on, label: 'Entrega das alterações', t, tone: 'bg-violet-500/10 text-violet-600' } : null,
  ]).filter((e): e is Ev => !!e);
  const days = [...new Set(ev.map((e) => e.date))].sort();
  if (!days.length) return <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">Nenhuma data marcada.</div>;
  return (
    <div className="space-y-4">{days.map((d) => (
      <section key={d} className="card !p-5"><h2 className={`mb-3 text-sm font-semibold ${d < today ? 'text-danger' : ''}`}>{dateBR(d)}{d === today ? ' · hoje' : d < today ? ' · atrasado' : ''}</h2>
        <ul className="space-y-2 text-sm">{ev.filter((e) => e.date === d).map((e, i) => (<li key={e.t.id + i} className="flex items-center justify-between gap-3"><span><Link href={hrefFor(e.t.id)} className="hover:underline">{e.t.title}</Link> <span className="text-xs text-muted">· {e.t.project}{peopleOf(e.t).length ? ` · ${peopleOf(e.t).join(', ')}` : ''}</span></span><span className={`badge ${e.tone}`}>{e.label}</span></li>))}</ul></section>))}</div>
  );
}
