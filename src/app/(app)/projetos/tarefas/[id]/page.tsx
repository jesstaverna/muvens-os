import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FileUploader } from '../../FileUploader';
import { addChecklistItem, addComment, deleteTaskFile, deleteTime, toggleFileVisible, logTime, removeChecklistItem, setTaskStatus, toggleChecklistItem, updateTask } from '../../actions';
import { PRIORITY, TASK_STATUS, fmtMinutes, todayBR } from '@/lib/domain';
import { dateTimeBR } from '@/lib/format';

const EVT: Record<string, string> = { criada: 'Criada', status: 'Status', responsavel: 'Responsável', prazo: 'Prazo', prioridade: 'Prioridade', fora_escopo: 'Escopo' };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await requireModule('projetos');
  const canWrite = ['admin', 'comercial', 'designer', 'trafego'].includes(profile.role);
  const { data: t } = await supabase.from('tasks').select('*, projects(id, name, client_id, clients(name))').eq('id', id).maybeSingle();
  if (!t) notFound();
  const [{ data: people }, { data: items }, { data: comments }, { data: events }, { data: files }, { data: time }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('role', ['admin', 'comercial', 'designer', 'trafego']).eq('active', true).order('full_name'),
    supabase.from('task_checklist_items').select('*').eq('task_id', id).order('position'),
    supabase.from('task_comments').select('id, body, created_at, author:profiles(full_name)').eq('task_id', id).order('created_at', { ascending: false }),
    supabase.from('task_events').select('id, kind, detail, created_at, actor:profiles(full_name)').eq('task_id', id).order('created_at', { ascending: false }).limit(60),
    supabase.from('task_files').select('id, name, size, created_at, client_visible').eq('task_id', id).order('created_at', { ascending: false }),
    supabase.from('time_entries').select('id, minutes, worked_on, note, user_id, who:profiles(full_name)').eq('task_id', id).order('worked_on', { ascending: false }),
  ]);
  const proj = one(t.projects) as { id: string; name: string; clients: { name: string } | { name: string }[] | null } | null;
  const st = TASK_STATUS[t.status];
  const totalMin = (time ?? []).reduce((a, e) => a + e.minutes, 0);
  const late = t.due_on && t.due_on < todayBR() && !['entregue', 'aprovado', 'cancelada'].includes(t.status);
  const btn = (status: string, label: string, opts: { primary?: boolean; ask?: boolean; confirm?: string } = {}) => (
    <form action={setTaskStatus.bind(null, id, status)} className="flex items-center gap-2">{opts.ask && <input name="note" placeholder="Observação (opcional)" className="input !w-52 !py-1.5 text-xs" aria-label="Observação" />}
      <SubmitButton className={opts.primary ? 'btn btn-sm btn-primary' : 'btn btn-sm'} pendingText="…" confirm={opts.confirm}>{label}</SubmitButton></form>);
  const next: Record<string, React.ReactNode> = {
    a_fazer: btn('em_andamento', 'Iniciar', { primary: true }),
    em_andamento: btn('produzido', 'Marcar como produzido', { primary: true }),
    produzido: <>{btn('enviado', 'Enviar ao cliente para aprovação', { primary: true })}{btn('em_andamento', 'Voltar para andamento')}</>,
    enviado: <>{btn('aprovado', 'Registrar aprovação do cliente', { primary: true, ask: true, confirm: 'O cliente aprovou esta peça?' })}{btn('ajustes', 'Cliente pediu ajustes', { ask: true })}</>,
    ajustes: <>{btn('produzido', 'Ajustes feitos — pronto para reenvio', { primary: true })}{btn('em_andamento', 'Voltar para andamento')}</>,
    aprovado: btn('entregue', 'Marcar como entregue (arquivos finais)', { primary: true }),
    entregue: profile.role === 'admin' ? btn('em_andamento', 'Reabrir', { confirm: 'Reabrir tarefa entregue?' }) : null,
  };

  return (
    <>
      <PageHeader title={t.title} subtitle={`${one(proj?.clients)?.name ?? ''} · ${proj?.name}`} actions={<><span className={`badge ${st.tone}`}>{st.label}</span><Link href={`/projetos/${proj?.id}`} className="btn btn-sm">← Projeto</Link></>} />
      {t.out_of_scope && <div className="card mb-6 border-amber-500/40 bg-amber-500/10 text-sm"><b className="text-warn">Fora do escopo contratado.</b> {t.out_of_scope_note ?? 'Orçar à parte.'}</div>}
      {canWrite && next[t.status] && <div className="mb-6 flex flex-wrap items-center gap-3 card !p-4">{next[t.status]}</div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <form action={updateTask.bind(null, id)} className="card space-y-5"><h2 className="text-base font-semibold">Detalhes e briefing</h2><fieldset disabled={!canWrite} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2"><Field label="Título"><input name="title" defaultValue={t.title} required className="input" /></Field>
              <Field label="Responsável"><select name="assignee_id" defaultValue={t.assignee_id ?? ''} className="input"><option value="">—</option>{people?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
              <Field label="Prazo"><input type="date" name="due_on" defaultValue={t.due_on ?? ''} className={`input ${late ? 'border-danger' : ''}`} /></Field>
              <Field label="Prioridade"><select name="priority" defaultValue={t.priority} className="input">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field></div>
            <Field label="Briefing (interno)"><textarea name="briefing" rows={6} defaultValue={t.briefing ?? ''} className="input" /></Field>
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start"><label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="internal" defaultChecked={t.internal} /> Interna (oculta no portal)</label>
              <Field label="Descrição para o cliente" hint="Texto mostrado ao cliente na aprovação. O briefing interno nunca aparece no portal."><textarea name="briefing_public" rows={2} defaultValue={t.briefing_public ?? ''} className="input" /></Field></div>
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-end"><label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="out_of_scope" defaultChecked={t.out_of_scope} /> Fora do escopo</label><Field label="Observação sobre o escopo"><input name="out_of_scope_note" defaultValue={t.out_of_scope_note ?? ''} className="input" /></Field></div></fieldset>
            {canWrite && <SubmitButton>Salvar</SubmitButton>}</form>

          <section className="card"><h2 className="mb-4 text-base font-semibold">Checklist</h2>
            <ul className="mb-4 space-y-2">{items?.map((i) => (<li key={i.id} className="flex items-center justify-between gap-2 text-sm"><form action={toggleChecklistItem.bind(null, id, i.id, !i.done)} className="flex items-center gap-2"><button className="grid h-5 w-5 place-items-center rounded border border-line text-xs" aria-label={i.done ? 'Desmarcar' : 'Marcar'} disabled={!canWrite}>{i.done ? '✓' : ''}</button><span className={i.done ? 'text-muted line-through' : ''}>{i.text}</span></form>
              {canWrite && <form action={removeChecklistItem.bind(null, id, i.id)}><button className="text-xs text-muted hover:text-danger" aria-label="Remover">remover</button></form>}</li>))}{!items?.length && <li className="text-sm text-muted">Sem itens.</li>}</ul>
            {canWrite && <form action={addChecklistItem.bind(null, id)} className="flex gap-2"><input name="text" required placeholder="Novo item" className="input" aria-label="Novo item" /><SubmitButton className="btn btn-sm" pendingText="…">Adicionar</SubmitButton></form>}</section>

          <section className="card"><h2 className="mb-4 text-base font-semibold">Comentários</h2>
            {canWrite && <form action={addComment.bind(null, id)} className="mb-5 flex gap-2"><input name="body" required placeholder="Escreva um comentário" className="input" aria-label="Comentário" /><SubmitButton pendingText="…">Publicar</SubmitButton></form>}
            <ul className="space-y-3">{comments?.map((c) => (<li key={c.id} className="text-sm"><div className="text-xs text-muted">{one(c.author)?.full_name ?? 'Usuário'} · {dateTimeBR(c.created_at)}</div>{c.body}</li>))}{!comments?.length && <li className="text-sm text-muted">Sem comentários.</li>}</ul></section>
        </div>

        <aside className="space-y-6">
          <section className="card"><h2 className="mb-1 text-base font-semibold">Horas</h2><p className="mb-4 text-2xl font-semibold">{fmtMinutes(totalMin)}</p>
            {canWrite && <form action={logTime.bind(null, id)} className="mb-4 space-y-3"><div className="grid grid-cols-2 gap-2"><Field label="Tempo"><input name="duration" required placeholder="1:30 ou 1,5" className="input" /></Field><Field label="Dia"><input type="date" name="worked_on" defaultValue={todayBR()} className="input" /></Field></div><Field label="Nota"><input name="note" className="input" /></Field><SubmitButton className="btn btn-sm" pendingText="…">Apontar horas</SubmitButton></form>}
            <ul className="space-y-2 text-sm">{time?.map((e) => (<li key={e.id} className="flex items-start justify-between gap-2"><span>{fmtMinutes(e.minutes)} · {one(e.who)?.full_name}<span className="block text-xs text-muted">{e.worked_on.split('-').reverse().join('/')}{e.note ? ` — ${e.note}` : ''}</span></span>{(e.user_id === profile.id || profile.role === 'admin') && <form action={deleteTime.bind(null, id, e.id)}><button className="text-xs text-muted hover:text-danger">remover</button></form>}</li>))}</ul></section>

          <section className="card"><h2 className="mb-4 text-base font-semibold">Arquivos</h2>
            <ul className="mb-4 space-y-2 text-sm">{files?.map((f) => (<li key={f.id} className="flex items-center justify-between gap-2"><a className="truncate underline" href={`/projetos/tarefas/${id}/arquivo?f=${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>{canWrite && <span className="flex shrink-0 items-center gap-2"><form action={toggleFileVisible.bind(null, id, f.id, !f.client_visible)}><button className={`badge ${f.client_visible ? 'bg-lime/40' : ''}`} title="Alternar visibilidade para o cliente">{f.client_visible ? 'visível ao cliente' : 'só equipe'}</button></form><form action={deleteTaskFile.bind(null, id, f.id)}><button className="text-xs text-muted hover:text-danger">remover</button></form></span>}</li>))}{!files?.length && <li className="text-muted">Nenhum arquivo.</li>}</ul>
            {canWrite && <FileUploader taskId={id} />}</section>

          <section className="card"><h2 className="mb-4 text-base font-semibold">Histórico de alterações</h2>
            <ol className="space-y-2.5 text-sm">{events?.map((e) => (<li key={e.id}><div className="text-xs text-muted">{dateTimeBR(e.created_at)} · {one(e.actor)?.full_name ?? 'sistema'}</div><b>{EVT[e.kind] ?? e.kind}</b>{e.detail ? `: ${e.detail}` : ''}</li>))}</ol></section>
        </aside>
      </div>
    </>
  );
}
