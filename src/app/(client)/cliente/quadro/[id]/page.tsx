import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePortal } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { CLIENT_TASK_STATUS, todayBR } from '@/lib/domain';
import { AREAS, adjustedDue, columnOf, COLUMNS, lateness } from '@/lib/projects/board';
import { dateBR, dateTimeBR } from '@/lib/format';
import { addTaskComment, addTaskLink, contentSent, decideOnTask, requestChange } from '../../actions';

type Detail = {
  id: string; title: string; status: string; area: string | null; starts_on: string | null; due_on: string | null; review_due_on: string | null; changes_due_on: string | null; client_wait_days: number; origin: string;
  description: string | null; created_at: string; project: string; assignee: string | null; assignees: string[];
  links: { id: string; kind: string; label: string | null; url: string; from_client: boolean; created_at: string }[];
  files: { id: string; name: string }[];
  comments: { id: string; body: string; from_client: boolean; author: string; created_at: string }[];
};
const KIND: Record<string, string> = { conteudo: 'Conteúdo enviado por você', referencia: 'Referência', entrega: 'Entrega da Muvens' };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export default async function DemandaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requirePortal();
  const { data, error } = await supabase.rpc('portal_task_detail', { p_id: id });
  if (error || !data) notFound();
  const t = data as Detail;
  const today = todayBR(); const late = lateness(t, today); const st = CLIENT_TASK_STATUS[t.status];
  const col = COLUMNS.find((c) => c.key === columnOf(t))!.label;
  const dateRow = (label: string, v: string | null, hint?: string) => v ? <div><dt className="text-xs text-muted">{label}</dt><dd className={`text-sm font-medium ${late.late && late.due === v ? 'text-danger' : ''}`}>{dateBR(v)}{hint ? <span className="block text-xs font-normal text-muted">{hint}</span> : null}</dd></div> : null;
  return (
    <>
      <Link href="/cliente/quadro" className="text-sm text-muted hover:text-fg">← Quadro</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="h1">{t.title}</h1><p className="mt-1.5 text-sm text-muted">{t.project}{t.area ? ` · ${AREAS[t.area]}` : ''} · {col}</p></div>
        <div className="flex flex-wrap items-center gap-2">{st && <span className={`badge ${st.tone}`}>{st.label}</span>}{late.late && <span className="rounded-md bg-danger/10 px-2 py-1 text-xs font-medium text-danger">{late.what} em atraso há {late.days} {late.days === 1 ? 'dia' : 'dias'}</span>}</div>
      </div>

      {t.status === 'enviado' && (
        <section className="card mb-6 border-amber-500/50"><h2 className="text-base font-semibold">Aguardando a sua aprovação</h2>
          <p className="mt-1 text-sm text-muted">{t.review_due_on ? `Combinado para devolver até ${dateBR(t.review_due_on)}.` : 'Veja os arquivos/links abaixo e responda.'} Ao aprovar, a equipe segue para a entrega final.</p>
          <form className="mt-4 space-y-3"><label className="block"><span className="label">Comentário (obrigatório para pedir ajustes)</span><textarea name="comment" rows={3} className="input" /></label>
            <div className="flex flex-wrap gap-2"><button formAction={decideOnTask.bind(null, t.id, 'aprovar')} className="btn btn-primary">Aprovar</button><button formAction={decideOnTask.bind(null, t.id, 'ajustes')} className="btn">Solicitar ajustes</button></div></form></section>)}
      {t.status === 'aguardando_cliente' && (
        <section className="card mb-6 border-amber-500/50"><h2 className="text-base font-semibold">A equipe precisa do seu conteúdo</h2>
          <p className="mt-1 text-sm text-muted">Cole abaixo o link (Drive, Dropbox, WeTransfer…) com textos, originais e imagens. Ao enviar, a demanda volta para a fila da equipe.</p>
          <form action={contentSent.bind(null, t.id)} className="mt-3"><SubmitButton className="btn btn-sm" pendingText="…">Já enviei o conteúdo por outro canal</SubmitButton></form></section>)}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {t.description && <section className="card"><h2 className="mb-2 text-base font-semibold">Descrição</h2><p className="whitespace-pre-line text-sm">{t.description}</p></section>}
          <section className="card"><h2 className="mb-3 text-base font-semibold">Links e arquivos</h2>
            {!t.links.length && !t.files.length && <p className="mb-3 text-sm text-muted">Nenhum link ainda.</p>}
            <ul className="mb-4 space-y-2 text-sm">{t.links.map((l) => (<li key={l.id} className="flex items-center justify-between gap-3 rounded-xl bg-subtle px-3 py-2"><span className="min-w-0"><span className="block text-xs text-muted">{KIND[l.kind]}</span><a href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium underline">{l.label || host(l.url)}</a></span><span className="shrink-0 text-xs text-muted">{host(l.url)}</span></li>))}
              {t.files.map((f) => <li key={f.id}><a className="btn btn-sm" href={`/cliente/arquivo?kind=task&id=${f.id}`} target="_blank" rel="noreferrer">Ver / baixar {f.name}</a></li>)}</ul>
            <form action={addTaskLink.bind(null, t.id)} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="block sm:col-span-2"><span className="label">Adicionar link</span><input type="url" name="url" required maxLength={1000} placeholder="https://drive.google.com/…" className="input" /></label>
              <label className="block"><span className="label">Tipo</span><select name="kind" className="input"><option value="conteudo">Conteúdo (textos, originais, fotos)</option><option value="referencia">Referência</option></select></label>
              <label className="block"><span className="label">Nome (opcional)</span><input name="label" maxLength={120} placeholder="Ex.: Manuscrito capítulos 1–5" className="input" /></label>
              <div className="self-end"><SubmitButton pendingText="Enviando…">Enviar link</SubmitButton></div></form></section>
          <section className="card"><h2 className="mb-3 text-base font-semibold">Mensagens</h2>
            <ul className="mb-4 space-y-3">{t.comments.map((c) => (<li key={c.id} className={`rounded-xl p-3 text-sm ${c.from_client ? 'bg-subtle' : 'bg-lime/20'}`}><div className="mb-0.5 text-xs text-muted">{c.author} · {dateTimeBR(c.created_at)}</div><p className="whitespace-pre-line">{c.body}</p></li>))}{!t.comments.length && <li className="text-sm text-muted">Sem mensagens.</li>}</ul>
            <form action={addTaskComment.bind(null, t.id)} className="space-y-3"><textarea name="body" required rows={3} maxLength={4000} className="input" aria-label="Mensagem" placeholder="Escreva uma mensagem para a equipe" /><SubmitButton pendingText="Enviando…">Enviar mensagem</SubmitButton></form></section>
          {(t.status === 'aprovado' || t.status === 'entregue') && (
            <section className="card"><h2 className="mb-1 text-base font-semibold">Pedir uma alteração</h2><p className="mb-3 text-sm text-muted">Para mudar algo depois de aprovado, descreva aqui. O pedido vira uma nova demanda no quadro.</p>
              <form action={requestChange.bind(null, t.id)} className="space-y-3"><textarea name="body" required minLength={3} rows={3} maxLength={8000} className="input" aria-label="Alteração desejada" /><SubmitButton pendingText="Enviando…">Pedir alteração</SubmitButton></form></section>)}
        </div>
        <aside className="space-y-6"><section className="card"><h2 className="mb-3 text-base font-semibold">Datas e responsável</h2>
          <dl className="space-y-3">{dateRow('Início', t.starts_on)}{dateRow('Entrega combinada', t.due_on)}{adjustedDue(t) !== t.due_on && dateRow('Entrega prevista', adjustedDue(t), `+${Math.ceil(t.client_wait_days)} dias em que a demanda ficou aguardando você`)}{t.status === 'enviado' && dateRow('Devolução da revisão', t.review_due_on, 'prazo para você aprovar ou pedir ajustes')}{t.status === 'ajustes' && dateRow('Entrega das alterações', t.changes_due_on, 'prazo da equipe para refazer')}
            {!t.starts_on && !t.due_on && <p className="text-sm text-muted">A equipe ainda vai definir os prazos.</p>}
            <div><dt className="text-xs text-muted">{t.assignees.length > 1 ? 'Pessoas envolvidas' : 'Responsável'}</dt><dd className="mt-1 space-y-1.5 text-sm">{(t.assignees.length ? t.assignees : t.assignee ? [t.assignee] : []).map((n) => <div key={n} className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-fg text-[11px] font-bold text-lime">{n.trim().charAt(0).toUpperCase()}</span><span className="font-medium">{n}</span></div>)}{!t.assignees.length && !t.assignee && <span className="font-medium">A definir</span>}</dd></div>
            <div><dt className="text-xs text-muted">Criada em</dt><dd className="text-sm">{dateBR(t.created_at)}{t.origin === 'cliente' ? ' · por você' : ''}</dd></div></dl></section></aside>
      </div>
    </>
  );
}
