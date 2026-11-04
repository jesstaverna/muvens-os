import Link from 'next/link';
import { personName } from '@/lib/people';
import { AssigneePicker } from '@/components/AssigneePicker';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FileUploader } from '../../FileUploader';
import { addChecklistItem, addComment, addTaskLink, removeTaskLink, setTaskContacts, deleteTaskFile, deleteTime, toggleFileVisible, logTime, removeChecklistItem, setTaskStatus, toggleChecklistItem, updateTask } from '../../actions';
import { PRIORITY, TASK_STATUS, fmtMinutes, todayBR } from '@/lib/domain';
import { dateTimeBR } from '@/lib/format';
import { LinkButton } from '@/components/LinkButton';

const EVT: Record<string, string> = { criada: 'Criada', status: 'Status', responsavel: 'Responsável', prazo: 'Prazo', prioridade: 'Prioridade', fora_escopo: 'Escopo' };
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await requireModule('projetos');
  const canWrite = ['admin', 'comercial', 'designer', 'trafego'].includes(profile.role);
  const { data: t } = await supabase.from('tasks').select('*, projects(id, name, client_id, clients(name))').eq('id', id).maybeSingle();
  if (!t) notFound();
  const [{ data: people }, { data: items }, { data: comments }, { data: events }, { data: files }, { data: time }, { data: links }, { data: coRows }, { data: services }, { data: contactsAll }, { data: tcRows }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').in('role', ['admin', 'comercial', 'designer', 'trafego']).eq('active', true).order('full_name'),
    supabase.from('task_checklist_items').select('*').eq('task_id', id).order('position'),
    supabase.from('task_comments').select('id, body, created_at, from_client, client_visible, author:profiles(full_name, email)').eq('task_id', id).order('created_at', { ascending: false }),
    supabase.from('task_events').select('id, kind, detail, created_at, actor:profiles(full_name, email)').eq('task_id', id).order('created_at', { ascending: false }).limit(60),
    supabase.from('task_files').select('id, name, size, created_at, client_visible').eq('task_id', id).order('created_at', { ascending: false }),
    supabase.from('time_entries').select('id, minutes, worked_on, note, user_id, who:profiles(full_name, email)').eq('task_id', id).order('worked_on', { ascending: false }),
    supabase.from('task_links').select('id, kind, label, url, from_client, client_visible, created_at').eq('task_id', id).order('created_at'),
    supabase.from('task_assignees').select('user_id').eq('task_id', id),
    supabase.rpc('staff_service_options', { p_client: null }),
    supabase.from('client_contacts').select('id, name, role_title, email, phone, is_primary, client_id'),
    supabase.from('task_contacts').select('contact_id').eq('task_id', id),
  ]);
  const proj = one(t.projects) as { id: string; name: string; client_id: string; clients: { name: string } | { name: string }[] | null } | null;
  const myContacts = (contactsAll ?? []).filter((c) => c.client_id === proj?.client_id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));
  const picked = new Set((tcRows ?? []).map((r) => r.contact_id as string));
  const nameOf = new Map((people ?? []).map((p) => [p.id, personName(p)]));
  const team = [...(t.assignee_id && nameOf.get(t.assignee_id) ? [{ id: t.assignee_id, name: nameOf.get(t.assignee_id)!, role: 'Responsável' }] : []),
    ...(coRows ?? []).filter((c) => c.user_id !== t.assignee_id && nameOf.get(c.user_id)).map((c) => ({ id: c.user_id as string, name: nameOf.get(c.user_id)!, role: 'Colaborador' }))];
  const clientPeople = [...new Set((comments ?? []).filter((c) => c.from_client).map((c) => personName(one(c.author), '')).filter((n) => !!n))];
  const st = TASK_STATUS[t.status];
  const totalMin = (time ?? []).reduce((a, e) => a + e.minutes, 0);
  const late = t.due_on && t.due_on < todayBR() && !['entregue', 'aprovado', 'cancelada'].includes(t.status);
  const btn = (status: string, label: string, opts: { primary?: boolean; ask?: boolean; confirm?: string } = {}) => (
    <form action={setTaskStatus.bind(null, id, status)} className="flex items-center gap-2">{opts.ask && <input name="note" placeholder="Observação (opcional)" className="input !w-52 !py-1.5 text-xs" aria-label="Observação" />}
      <SubmitButton className={opts.primary ? 'btn btn-sm btn-primary' : 'btn btn-sm'} pendingText="…" confirm={opts.confirm}>{label}</SubmitButton></form>);
  const next: Record<string, React.ReactNode> = {
    solicitada: <>{btn('a_fazer', 'Aceitar e colocar na fila', { primary: true })}{btn('aguardando_cliente', 'Pedir conteúdo ao cliente')}</>,
    aguardando_cliente: btn('a_fazer', 'Conteúdo recebido — colocar na fila', { primary: true }),
    a_fazer: <>{btn('em_andamento', 'Iniciar', { primary: true })}{btn('aguardando_cliente', 'Pedir conteúdo ao cliente')}</>,
    em_andamento: btn('produzido', 'Marcar como produzido', { primary: true }),
    produzido: <>{btn('enviado', 'Enviar ao cliente para aprovação', { primary: true })}{btn('em_andamento', 'Voltar para andamento')}</>,
    enviado: <>{btn('aprovado', 'Registrar aprovação do cliente', { primary: true, ask: true, confirm: 'O cliente aprovou esta peça?' })}{btn('ajustes', 'Cliente pediu ajustes', { ask: true })}</>,
    ajustes: <>{btn('produzido', 'Ajustes feitos — pronto para reenvio', { primary: true })}{btn('em_andamento', 'Voltar para andamento')}</>,
    aprovado: btn('entregue', 'Marcar como entregue (arquivos finais)', { primary: true }),
    entregue: profile.role === 'admin' ? btn('em_andamento', 'Reabrir', { confirm: 'Reabrir tarefa entregue?' }) : null,
  };

  return (
    <>
      <PageHeader title={t.title} subtitle={`${one(proj?.clients)?.name ?? ''} · ${proj?.name}`} actions={<><span className={`badge ${st.tone}`}>{st.label}</span><LinkButton href={`/projetos/${proj?.id}`} className="btn btn-sm">← Projeto</LinkButton></>} />
      {t.out_of_scope && <div className="card mb-6 border-amber-500/40 bg-amber-500/10 text-sm"><b className="text-warn">Fora do escopo contratado.</b> {t.out_of_scope_note ?? 'Orçar à parte.'}</div>}
      {canWrite && next[t.status] && <div className="mb-6 flex flex-wrap items-center gap-3 card !p-4">{next[t.status]}</div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <form action={updateTask.bind(null, id)} className="card space-y-5"><h2 className="text-base font-semibold">Detalhes e briefing</h2><fieldset disabled={!canWrite} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2"><Field label="Título"><input name="title" defaultValue={t.title} required className="input" /></Field>
              <div className="sm:col-span-2"><AssigneePicker people={people ?? []} selected={(coRows ?? []).map((c) => c.user_id as string)} primary={t.assignee_id} disabled={!canWrite} /></div>
              <Field label="Início"><input type="date" name="starts_on" defaultValue={t.starts_on ?? ''} className="input" /></Field>
              <Field label="Entrega"><input type="date" name="due_on" defaultValue={t.due_on ?? ''} className={`input ${late ? 'border-danger' : ''}`} /></Field>
              <Field label="Devolução da revisão (cliente)" hint="Até quando o cliente deve aprovar ou pedir ajustes. Sugerida ao enviar para aprovação."><input type="date" name="review_due_on" defaultValue={t.review_due_on ?? ''} className="input" /></Field>
              <Field label="Entrega das alterações (equipe)" hint="Até quando a equipe refaz os ajustes. Sugerida ao registrar ajustes."><input type="date" name="changes_due_on" defaultValue={t.changes_due_on ?? ''} className="input" /></Field>
              <Field label="Serviço do cliente"><select name="service_id" defaultValue={t.service_id ?? ''} className="input"><option value="">—</option>{(services ?? []).filter((sv: { client_id: string }) => sv.client_id === proj?.client_id).map((sv: { id: string; service: string }) => <option key={sv.id} value={sv.id}>{sv.service}</option>)}</select></Field>
              <Field label="Área"><select name="area" defaultValue={t.area ?? ''} className="input"><option value="">—</option><option value="diagramacao">Diagramação</option><option value="social_media">Social Media</option><option value="outro">Outra</option></select></Field>
              <Field label="Prioridade"><select name="priority" defaultValue={t.priority} className="input">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field></div>
            <Field label="Briefing (interno)"><textarea name="briefing" rows={6} defaultValue={t.briefing ?? ''} className="input" /></Field>
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start"><label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="internal" defaultChecked={t.internal} /> Interna (oculta no portal)</label>
              <Field label="Descrição para o cliente" hint="Texto mostrado ao cliente na aprovação. O briefing interno nunca aparece no portal."><textarea name="briefing_public" rows={2} defaultValue={t.briefing_public ?? ''} className="input" /></Field></div>
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-end"><label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="out_of_scope" defaultChecked={t.out_of_scope} /> Fora do escopo</label><Field label="Observação sobre o escopo"><input name="out_of_scope_note" defaultValue={t.out_of_scope_note ?? ''} className="input" /></Field></div></fieldset>
            {canWrite && <SubmitButton>Salvar</SubmitButton>}</form>

          <section className="card"><h2 className="mb-1 text-base font-semibold">Links</h2><p className="mb-4 text-xs text-muted">Onde estão os conteúdos (do cliente) e as entregas (da Muvens). Links marcados como visíveis aparecem no portal.</p>
            <ul className="mb-4 space-y-2 text-sm">{links?.map((l) => (<li key={l.id} className="flex items-center justify-between gap-2"><span className="min-w-0"><span className="block text-xs text-muted">{{ conteudo: 'Conteúdo do cliente', referencia: 'Referência', entrega: 'Entrega' }[l.kind as string]}{l.from_client ? ' · enviado pelo cliente' : ''}{l.client_visible ? '' : ' · oculto ao cliente'}</span><a href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate underline">{l.label || l.url}</a></span>{canWrite && <form action={removeTaskLink.bind(null, id, l.id)}><button className="text-xs text-muted hover:text-danger" aria-label="Remover link">remover</button></form>}</li>))}{!links?.length && <li className="text-muted">Nenhum link.</li>}</ul>
            {canWrite && <form action={addTaskLink.bind(null, id)} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]"><Field label="Link"><input type="url" name="url" required placeholder="https://…" className="input" /></Field><Field label="Tipo"><select name="kind" defaultValue="entrega" className="input"><option value="entrega">Entrega (arquivos finais)</option><option value="conteudo">Conteúdo do cliente</option><option value="referencia">Referência</option></select></Field><Field label="Nome"><input name="label" maxLength={120} className="input" placeholder="Pasta final" /></Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="client_visible" defaultChecked /> Visível ao cliente no portal</label><SubmitButton className="btn btn-sm" pendingText="…">Adicionar link</SubmitButton></form>}</section>

          <section className="card"><h2 className="mb-4 text-base font-semibold">Checklist</h2>
            <ul className="mb-4 space-y-2">{items?.map((i) => (<li key={i.id} className="flex items-center justify-between gap-2 text-sm"><form action={toggleChecklistItem.bind(null, id, i.id, !i.done)} className="flex items-center gap-2"><button className="grid h-5 w-5 place-items-center rounded border border-line text-xs" aria-label={i.done ? 'Desmarcar' : 'Marcar'} disabled={!canWrite}>{i.done ? '✓' : ''}</button><span className={i.done ? 'text-muted line-through' : ''}>{i.text}</span></form>
              {canWrite && <form action={removeChecklistItem.bind(null, id, i.id)}><button className="text-xs text-muted hover:text-danger" aria-label="Remover">remover</button></form>}</li>))}{!items?.length && <li className="text-sm text-muted">Sem itens.</li>}</ul>
            {canWrite && <form action={addChecklistItem.bind(null, id)} className="flex gap-2"><input name="text" required placeholder="Novo item" className="input" aria-label="Novo item" /><SubmitButton className="btn btn-sm" pendingText="…">Adicionar</SubmitButton></form>}</section>

          <section className="card"><h2 className="mb-4 text-base font-semibold">Comentários</h2>
            {canWrite && <form action={addComment.bind(null, id)} className="mb-5 space-y-2"><div className="flex gap-2"><input name="body" required placeholder="Escreva um comentário" className="input" aria-label="Comentário" /><SubmitButton pendingText="…">Publicar</SubmitButton></div><label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="client_visible" /> Visível ao cliente no portal (desmarcado = comentário interno)</label></form>}
            <ul className="space-y-3">{comments?.map((c) => (<li key={c.id} className="text-sm"><div className="text-xs text-muted">{personName(one(c.author), 'Usuário')} · {dateTimeBR(c.created_at)}{c.from_client ? ' · do cliente' : c.client_visible ? ' · visível ao cliente' : ' · interno'}</div>{c.body}</li>))}{!comments?.length && <li className="text-sm text-muted">Sem comentários.</li>}</ul></section>
        </div>

        <aside className="space-y-6">
          <section className="card"><h2 className="mb-3 text-base font-semibold">Pessoas envolvidas</h2>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Equipe Muvens</h3>
            <ul className="mb-5 space-y-2 text-sm">{team.map((p) => (<li key={p.id} className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-fg text-[11px] font-bold text-lime">{p.name.trim().charAt(0).toUpperCase()}</span><span className="min-w-0 truncate">{p.name}</span><span className="ml-auto shrink-0 text-xs text-muted">{p.role}</span></li>))}{!team.length && <li className="text-muted">Nenhum responsável definido.</li>}</ul>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Contatos de {one(proj?.clients)?.name ?? 'o cliente'}</h3>
            <ul className="space-y-3 text-sm">{myContacts.map((c) => (<li key={c.id} className="flex items-start gap-2"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-[11px] font-bold">{c.name.trim().charAt(0).toUpperCase()}</span>
              <span className="min-w-0"><span className="block truncate">{c.name}{c.role_title ? <span className="text-muted"> · {c.role_title}</span> : null}</span>
                <span className="block break-all text-xs text-muted">{c.email ? <a href={`mailto:${c.email}`} className="underline">{c.email}</a> : null}{c.email && c.phone ? ' · ' : ''}{c.phone ? <a href={`https://wa.me/${String(c.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="underline">{c.phone}</a> : null}</span></span>
              {picked.has(c.id) && <span className="ml-auto shrink-0 rounded-full bg-lime/40 px-2 py-0.5 text-[11px] font-medium">Participa</span>}</li>))}
              {!myContacts.length && <li className="text-muted">Nenhum contato cadastrado. <Link href={`/clientes/${proj?.client_id}`} className="underline">Cadastrar contatos</Link></li>}
              {clientPeople.filter((n) => !myContacts.some((c) => c.name === n)).map((n) => (<li key={n} className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-[11px] font-bold">{n.trim().charAt(0).toUpperCase()}</span><span className="min-w-0 truncate">{n}</span><span className="ml-auto shrink-0 text-xs text-muted">comentou</span></li>))}</ul></section>

          <form action={setTaskContacts.bind(null, id)} className="card"><h2 className="mb-1 text-base font-semibold">Quem participa desta tarefa</h2><p className="mb-3 text-xs text-muted">Marque os contatos de <Link href={`/clientes/${proj?.client_id}`} className="underline">{one(proj?.clients)?.name}</Link> que participam desta demanda (quem aprova, quem envia o conteúdo). O cliente vê nome e cargo no portal.</p>
            {!myContacts.length ? <p className="text-sm text-muted">Este cliente ainda não tem contatos cadastrados. <Link href={`/clientes/${proj?.client_id}`} className="underline">Cadastrar contatos</Link></p> : (
              <fieldset disabled={!canWrite} className="space-y-2">{myContacts.map((c) => (<label key={c.id} className="flex items-start gap-2 text-sm"><input type="checkbox" name="contact" value={c.id} defaultChecked={picked.has(c.id)} className="mt-1" /><span><b>{c.name}</b>{c.role_title ? <span className="text-muted"> · {c.role_title}</span> : null}
                <span className="block text-xs text-muted">{[c.email && <a key="m" href={`mailto:${c.email}`} className="underline">{c.email}</a>, c.phone && <a key="p" href={`https://wa.me/${String(c.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="underline">{c.phone}</a>].filter(Boolean).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ' · ', x] : [x]), [])}</span></span></label>))}</fieldset>)}
            {canWrite && myContacts.length > 0 && <div className="mt-4"><SubmitButton className="btn btn-sm" pendingText="…">Salvar contatos</SubmitButton></div>}</form>

          <section className="card"><h2 className="mb-1 text-base font-semibold">Horas</h2><p className="mb-4 text-2xl font-semibold">{fmtMinutes(totalMin)}</p>
            {canWrite && <form action={logTime.bind(null, id)} className="mb-4 space-y-3"><div className="grid grid-cols-2 gap-2"><Field label="Tempo"><input name="duration" required placeholder="1:30 ou 1,5" className="input" /></Field><Field label="Dia"><input type="date" name="worked_on" defaultValue={todayBR()} className="input" /></Field></div><Field label="Nota"><input name="note" className="input" /></Field><SubmitButton className="btn btn-sm" pendingText="…">Apontar horas</SubmitButton></form>}
            <ul className="space-y-2 text-sm">{time?.map((e) => (<li key={e.id} className="flex items-start justify-between gap-2"><span>{fmtMinutes(e.minutes)} · {personName(one(e.who), '—')}<span className="block text-xs text-muted">{e.worked_on.split('-').reverse().join('/')}{e.note ? ` — ${e.note}` : ''}</span></span>{(e.user_id === profile.id || profile.role === 'admin') && <form action={deleteTime.bind(null, id, e.id)}><button className="text-xs text-muted hover:text-danger">remover</button></form>}</li>))}</ul></section>

          <section className="card"><h2 className="mb-4 text-base font-semibold">Arquivos</h2>
            <ul className="mb-4 space-y-2 text-sm">{files?.map((f) => (<li key={f.id} className="flex items-center justify-between gap-2"><a className="truncate underline" href={`/projetos/tarefas/${id}/arquivo?f=${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>{canWrite && <span className="flex shrink-0 items-center gap-2"><form action={toggleFileVisible.bind(null, id, f.id, !f.client_visible)}><button className={`badge ${f.client_visible ? 'bg-lime/40' : ''}`} title="Alternar visibilidade para o cliente">{f.client_visible ? 'visível ao cliente' : 'só equipe'}</button></form><form action={deleteTaskFile.bind(null, id, f.id)}><button className="text-xs text-muted hover:text-danger">remover</button></form></span>}</li>))}{!files?.length && <li className="text-muted">Nenhum arquivo.</li>}</ul>
            {canWrite && <FileUploader taskId={id} />}</section>

          <section className="card"><h2 className="mb-4 text-base font-semibold">Histórico de alterações</h2>
            <ol className="space-y-2.5 text-sm">{events?.map((e) => (<li key={e.id}><div className="text-xs text-muted">{dateTimeBR(e.created_at)} · {personName(one(e.actor), 'sistema')}</div><b>{EVT[e.kind] ?? e.kind}</b>{e.detail ? `: ${e.detail}` : ''}</li>))}</ol></section>
        </aside>
      </div>
    </>
  );
}
