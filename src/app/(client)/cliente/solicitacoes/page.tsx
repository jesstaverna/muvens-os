import { requirePortal } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { createRequest } from '../actions';
import { REQUEST_KIND, REQUEST_STATUS } from '@/lib/domain';
import { dateTimeBR } from '@/lib/format';

export const metadata = { title: 'Solicitações' };
type Req = { id: string; kind: string; subject: string; body: string; status: string; response: string | null; created_at: string; responded_at: string | null };

export default async function Solicitacoes() {
  const { supabase } = await requirePortal();
  const { data } = await supabase.rpc('portal_requests');
  const reqs = (data ?? []) as Req[];
  return (
    <>
      <h1 className="h1">Solicitações</h1><p className="mb-8 mt-1.5 text-sm text-muted">Envie briefings, peça alterações ou fale com a equipe.</p>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <form action={createRequest} className="card h-fit space-y-4"><h2 className="text-base font-semibold">Nova mensagem</h2>
          <label className="block"><span className="label">Tipo</span><select name="kind" className="input"><option value="atendimento">Atendimento / dúvida</option><option value="briefing">Briefing</option><option value="alteracao">Solicitação de alteração</option></select></label>
          <label className="block"><span className="label">Assunto</span><input name="subject" required minLength={3} maxLength={200} className="input" /></label>
          <label className="block"><span className="label">Mensagem</span><textarea name="body" required minLength={3} rows={6} className="input" placeholder="Conte o que você precisa. Para briefings: objetivo, público, prazo desejado, referências." /></label>
          <SubmitButton pendingText="Enviando…">Enviar</SubmitButton></form>
        <section className="space-y-4">{!reqs.length ? <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">Você ainda não enviou solicitações.</div> : reqs.map((r) => (
          <article key={r.id} className="card !p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium">{r.subject}</div><span className="badge">{REQUEST_STATUS[r.status]}</span></div>
            <div className="mt-0.5 text-xs text-muted">{REQUEST_KIND[r.kind]} · {dateTimeBR(r.created_at)}</div><p className="mt-3 whitespace-pre-line text-sm">{r.body}</p>
            {r.response && <div className="mt-4 rounded-xl bg-subtle p-4 text-sm"><div className="mb-1 text-xs text-muted">Resposta da Muvens · {dateTimeBR(r.responded_at)}</div><p className="whitespace-pre-line">{r.response}</p></div>}</article>))}</section>
      </div>
    </>
  );
}
