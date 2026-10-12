'use client';
import { useState } from 'react';
import { Send, MessageCircle, Mail, Link2, ExternalLink } from 'lucide-react';
import { whatsappLink } from '@/lib/prospecting/message';

/** "Enviar proposta online": compartilha a landing page do diagnóstico. WhatsApp e e-mail abrem para uma PESSOA revisar e enviar (nada sai automaticamente). */
export function SendProposal({ token, name, phone, email }: { token: string; name: string; phone?: string | null; email?: string | null }) {
  const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false);
  const url = () => `${(process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '')}/diagnostico/${token}`;
  const msg = (u: string) => `Olá! Preparamos um diagnóstico da presença digital da ${name}, com sugestões de melhoria e uma proposta da Muvens. Veja aqui: ${u}`;
  const item = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-fg hover:bg-subtle';
  return (
    <div className="no-print relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-lg bg-lime px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"><Send className="h-3.5 w-3.5" strokeWidth={2} />Enviar proposta online</button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-line bg-card p-2 shadow-lg">
          <a className={item} href={`/diagnostico/${token}?p=1`} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" strokeWidth={1.8} />Abrir a página (pré-visualizar)</a>
          <button type="button" className={item} onClick={async () => { const u = url(); try { await navigator.clipboard.writeText(u); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt('Copie o link:', u); } }}><Link2 className="h-4 w-4" strokeWidth={1.8} />{copied ? 'Link copiado ✓' : 'Copiar link'}</button>
          {whatsappLink(phone, '') ? <button type="button" className={item} onClick={() => window.open(whatsappLink(phone, msg(url()))!, '_blank', 'noopener')}><MessageCircle className="h-4 w-4" strokeWidth={1.8} />Enviar por WhatsApp</button> : <div className={`${item} cursor-default text-muted`}><MessageCircle className="h-4 w-4" strokeWidth={1.8} />WhatsApp: sem telefone</div>}
          {email ? <a className={item} onClick={(e) => { e.currentTarget.href = `mailto:${email}?subject=${encodeURIComponent(`Diagnóstico de presença digital — ${name}`)}&body=${encodeURIComponent(msg(url()))}`; }} href="#"><Mail className="h-4 w-4" strokeWidth={1.8} />Enviar por e-mail</a> : <div className={`${item} cursor-default text-muted`}><Mail className="h-4 w-4" strokeWidth={1.8} />E-mail: sem endereço</div>}
          <p className="px-3 pb-1 pt-2 text-[11px] text-muted">WhatsApp e e-mail abrem com a mensagem pronta para você revisar e enviar.</p>
        </div>
      )}
    </div>
  );
}
