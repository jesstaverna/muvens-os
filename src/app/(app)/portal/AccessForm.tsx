'use client';
import { useActionState, useState } from 'react';
import { generateAccess, type AccessState } from './access-action';

export function AccessForm({ clients, defaults }: { clients: { id: string; name: string }[]; defaults: { email?: string; name?: string; client?: string } }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(generateAccess, {});
  const [copied, setCopied] = useState<string | null>(null);
  const first = (state.name ?? '').split(' ')[0];
  const message = state.link ? `Olá${first ? `, ${first}` : ''}! Este é o seu acesso ao Portal do Cliente da Muvens. Clique para entrar e criar a sua senha: ${state.link}` : '';
  const copy = async (key: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { /* o campo abaixo permite copiar à mão */ } };
  return (
    <section className="card">
      <h2 className="text-base font-semibold">Gerar link de acesso</h2>
      <p className="mb-4 mt-1 text-sm text-muted">Informe quem vai usar o portal. O sistema cria o login, vincula à empresa e gera um link para você enviar (WhatsApp ou e-mail). Quem abrir o link entra e define a própria senha.</p>
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label">Empresa do cliente</span><select name="client_id" required defaultValue={defaults.client ?? ''} className="input"><option value="" disabled>Escolha…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block"><span className="label">Nome da pessoa</span><input name="name" required minLength={2} maxLength={120} defaultValue={defaults.name ?? ''} className="input" placeholder="Ex.: Diego Vogt" /></label>
        <label className="block sm:col-span-2"><span className="label">E-mail de acesso</span><input name="email" type="email" required defaultValue={defaults.email ?? ''} className="input" placeholder="pessoa@empresa.com.br" /></label>
        <div className="sm:col-span-2"><button className="btn btn-primary" disabled={pending}>{pending ? 'Gerando…' : 'Gerar link de acesso'}</button></div>
      </form>
      {state.error && <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{state.error}</p>}
      {state.ok && state.link && (
        <div className="mt-5 space-y-3 rounded-2xl border border-lime/60 bg-lime/10 p-4" aria-live="polite">
          <p className="text-sm font-medium">{state.kind === 'novo' ? 'Acesso criado' : 'Novo link gerado'} para {state.name} ({state.email}). Envie ao cliente:</p>
          <textarea readOnly value={state.link} rows={3} className="input font-mono text-xs" aria-label="Link de acesso" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => copy('link', state.link!)}>{copied === 'link' ? 'Copiado!' : 'Copiar link'}</button>
            <button type="button" className="btn btn-sm" onClick={() => copy('msg', message)}>{copied === 'msg' ? 'Copiado!' : 'Copiar mensagem pronta'}</button>
            <a className="btn btn-sm" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(message)}`}>Abrir no WhatsApp</a>
          </div>
          <p className="text-xs text-muted">O link é de <b>uso único</b> e expira (o prazo padrão do Supabase é de 1 a 24 horas; ajuste em Authentication › Providers › Email › Email OTP Expiration). Ele não fica salvo aqui: se expirar ou for usado, gere outro. Gerar um novo link invalida o anterior.</p>
        </div>)}
    </section>
  );
}
