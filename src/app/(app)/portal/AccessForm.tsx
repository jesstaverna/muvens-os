'use client';
import { useActionState, useState } from 'react';
import { generateAccess, type AccessState } from './access-action';
import { generateStaffAccess } from '../configuracoes/staff-access-action';

export function AccessForm({ clients = [], contacts = [], defaults = {}, loginUrl, variant = 'cliente', roles = [] }: { clients?: { id: string; name: string }[]; contacts?: { id: string; client_id: string; name: string; email: string | null; role_title: string | null }[]; defaults?: { email?: string; name?: string; client?: string; mode?: string }; loginUrl: string; variant?: 'cliente' | 'equipe'; roles?: { value: string; label: string }[] }) {
  const equipe = variant === 'equipe';
  const [state, action, pending] = useActionState<AccessState, FormData>(equipe ? generateStaffAccess : generateAccess, {});
  const [mode, setMode] = useState<'link' | 'senha'>(defaults.mode === 'senha' ? 'senha' : 'link');
  const [copied, setCopied] = useState<string | null>(null);
  const [company, setCompany] = useState(defaults.client ?? '');
  const [name, setName] = useState(defaults.name ?? '');
  const [email, setEmail] = useState(defaults.email ?? '');
  const pickable = contacts.filter((c) => c.client_id === company);
  const first = (state.name ?? '').split(' ')[0];
  const linkMsg = state.link ? `Olá${first ? `, ${first}` : ''}! Este é o seu acesso ${equipe ? 'ao sistema MUVENS OS' : 'ao Portal do Cliente'} da Muvens. Clique para entrar e criar a sua senha: ${state.link}` : '';
  const passMsg = state.password ? `Olá${first ? `, ${first}` : ''}! Seu acesso ${equipe ? 'ao sistema MUVENS OS' : 'ao Portal do Cliente'} da Muvens:\nEndereço: ${state.loginUrl}\nLogin: ${state.email}\nSenha: ${state.password}\n(Você pode trocar a senha depois, em /definir-senha.)` : '';
  const copy = async (key: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { /* o campo permite copiar à mão */ } };
  const Btn = ({ k, text, children }: { k: string; text: string; children: string }) => <button type="button" className="btn btn-sm" onClick={() => copy(k, text)}>{copied === k ? 'Copiado!' : children}</button>;
  return (
    <section className="card">
      <h2 className="text-base font-semibold">{equipe ? 'Criar usuário da equipe' : 'Criar acesso para um usuário do cliente'}</h2>
      <p className="mb-4 mt-1 text-sm text-muted">{equipe ? 'Cada pessoa da equipe tem o próprio login e perfil. Repita para cada pessoa. Endereço de login:' : 'Cada pessoa da empresa tem o seu próprio login. Repita o formulário para cada usuário. Endereço de login do portal:'} <button type="button" onClick={() => copy('login', loginUrl)} className="font-mono underline">{loginUrl}</button>{copied === 'login' && ' — copiado!'}</p>
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        {equipe ? <label className="block"><span className="label">Perfil na equipe</span><select name="role" required defaultValue="" className="input"><option value="" disabled>Escolha…</option>{roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
          : <label className="block"><span className="label">Empresa do cliente</span><select name="client_id" required value={company} onChange={(e) => setCompany(e.target.value)} className="input"><option value="" disabled>Escolha…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {!equipe && company && (
          <div className="sm:col-span-2 rounded-xl border border-line p-3"><span className="label">Escolher entre os contatos cadastrados desta empresa</span>
            {pickable.length ? <div className="mt-2 flex flex-wrap gap-2">{pickable.map((c) => <button key={c.id} type="button" onClick={() => { setName(c.name); setEmail(c.email ?? ''); }} className="badge hover:bg-lime/40" title={c.email ?? 'Sem e-mail cadastrado'}>{c.name}{c.role_title ? ` · ${c.role_title}` : ''}</button>)}</div>
              : <p className="mt-1 text-xs text-muted">Nenhum contato cadastrado nesta empresa. Digite o nome e o e-mail abaixo, ou cadastre contatos em Clientes › contatos.</p>}
            {pickable.length > 0 && <p className="mt-2 text-xs text-muted">Clique em um nome para preencher nome e e-mail. Se o contato não tem e-mail, digite abaixo.</p>}</div>)}
        <label className="block"><span className="label">Nome da pessoa</span><input name="name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder={equipe ? 'Ex.: Dani Designer' : 'Ex.: Diego Vogt'} /></label>
        <label className="block sm:col-span-2"><span className="label">E-mail de acesso (será o login)</span><input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder={equipe ? 'pessoa@muvens.com.br' : 'pessoa@empresa.com.br'} /></label>
        <fieldset className="sm:col-span-2"><legend className="label">Como entregar o acesso</legend>
          <label className="mt-1 flex items-start gap-2 text-sm"><input type="radio" name="mode" value="link" checked={mode === 'link'} onChange={() => setMode('link')} className="mt-1" /><span><b>Link de acesso</b> — a pessoa abre o link e cria a própria senha (recomendado).</span></label>
          <label className="mt-2 flex items-start gap-2 text-sm"><input type="radio" name="mode" value="senha" checked={mode === 'senha'} onChange={() => setMode('senha')} className="mt-1" /><span><b>Login e senha</b> — o sistema gera uma senha forte agora. Ela aparece uma única vez; se a pessoa já tem acesso, a senha atual é substituída.</span></label></fieldset>
        <div className="sm:col-span-2"><button className="btn btn-primary" disabled={pending}>{pending ? 'Gerando…' : mode === 'senha' ? 'Gerar login e senha' : 'Gerar link de acesso'}</button></div>
      </form>
      {state.error && <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{state.error}</p>}
      {state.ok && state.mode === 'link' && state.link && (
        <div className="mt-5 space-y-3 rounded-2xl border border-lime/60 bg-lime/10 p-4" aria-live="polite">
          <p className="text-sm font-medium">{state.kind === 'novo' ? 'Acesso criado' : 'Novo link gerado'} para {state.name} ({state.email}). Envie ao cliente:</p>
          <textarea readOnly value={state.link} rows={3} className="input font-mono text-xs" aria-label="Link de acesso" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2"><Btn k="link" text={state.link}>Copiar link</Btn><Btn k="msg" text={linkMsg}>Copiar mensagem pronta</Btn><a className="btn btn-sm" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(linkMsg)}`}>Abrir no WhatsApp</a></div>
          <p className="text-xs text-muted">O link é de <b>uso único</b> e expira (prazo padrão do Supabase: 1 a 24 horas; ajuste em Authentication › Providers › Email › Email OTP Expiration). Não fica salvo aqui: se expirar ou for usado, gere outro. Gerar um novo invalida o anterior.</p>
        </div>)}
      {state.ok && state.mode === 'senha' && state.password && (
        <div className="mt-5 space-y-3 rounded-2xl border border-lime/60 bg-lime/10 p-4" aria-live="polite">
          <p className="text-sm font-medium">{state.kind === 'novo' ? 'Usuário criado' : 'Senha redefinida'} para {state.name}. Anote agora: <b>a senha não será mostrada de novo</b>.</p>
          <dl className="grid gap-1 text-sm sm:grid-cols-[6rem_1fr]"><dt className="text-muted">Endereço</dt><dd className="font-mono text-xs">{state.loginUrl}</dd><dt className="text-muted">Login</dt><dd className="font-mono text-xs">{state.email}</dd><dt className="text-muted">Senha</dt><dd className="font-mono text-sm font-semibold">{state.password}</dd></dl>
          <div className="flex flex-wrap gap-2"><Btn k="pw" text={state.password}>Copiar senha</Btn><Btn k="pmsg" text={passMsg}>Copiar mensagem pronta</Btn><a className="btn btn-sm" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(passMsg)}`}>Abrir no WhatsApp</a></div>
          <p className="text-xs text-muted">Envie por um canal seguro. A pessoa pode trocar a senha depois, em <b>/definir-senha</b>. Se esquecer, gere uma nova aqui.</p>
        </div>)}
    </section>
  );
}
