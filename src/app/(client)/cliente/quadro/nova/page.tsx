import { requirePortal } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { LinkButton } from '@/components/LinkButton';
import { createClientTask } from '../../actions';

export const metadata = { title: 'Nova demanda' };

export default async function NovaDemanda() {
  const { supabase } = await requirePortal();
  const { data } = await supabase.rpc('portal_board');
  const projects = ((data as { projects?: { id: string; name: string; status: string }[] } | null)?.projects ?? []).filter((p) => p.status !== 'concluido');
  return (
    <>
      <h1 className="h1">Nova demanda</h1><p className="mb-8 mt-1.5 text-sm text-muted">Conte o que você precisa. A equipe analisa, define responsável e prazos e você acompanha no quadro.</p>
      {!projects.length ? <div className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">Não há projeto liberado para novas demandas. Fale com a equipe.</div> : (
        <form action={createClientTask} className="card max-w-2xl space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block"><span className="label">Projeto</span><select name="project_id" required className="input">{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="block"><span className="label">Tipo de demanda</span><select name="area" required className="input" defaultValue=""><option value="" disabled>Escolha…</option><option value="diagramacao">Diagramação</option><option value="social_media">Social Media</option><option value="outro">Outra</option></select></label>
          </div>
          <label className="block"><span className="label">Título</span><input name="title" required minLength={3} maxLength={200} className="input" placeholder="Ex.: Diagramação do livro “Título”  ·  Posts de novembro" /></label>
          <label className="block"><span className="label">Descrição</span><textarea name="description" rows={5} maxLength={8000} className="input" placeholder="O que precisa ser feito, formato, quantidade de páginas ou peças, referências…" /></label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block"><span className="label">Data desejada de entrega (opcional)</span><input type="date" name="due_on" className="input" /></label>
            <label className="block"><span className="label">Link do conteúdo (opcional)</span><input type="url" name="link" maxLength={1000} className="input" placeholder="https://drive.google.com/…" /></label>
          </div>
          <p className="text-xs text-muted">Os conteúdos (textos, originais, fotos) ficam no seu Drive/Dropbox/WeTransfer: cole o link aqui ou na própria demanda. A data é um pedido; a equipe confirma o prazo.</p>
          <div className="flex gap-2"><SubmitButton pendingText="Enviando…">Enviar demanda</SubmitButton><LinkButton href="/cliente/quadro" className="btn">Cancelar</LinkButton></div>
        </form>)}
    </>
  );
}
