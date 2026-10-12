import { Mail, MessageCircle, Phone, Linkedin, UserRound, Briefcase } from 'lucide-react';
import type { Person } from '@/lib/prospecting/people';
import { whatsappSignal } from '@/lib/prospecting/phone';

const TONE = { confirmado: 'bg-lime/50 text-fg', provavel: 'bg-subtle text-fg', improvavel: 'border-amber-500/40 text-warn', outro: 'bg-blue-500/10 text-blue-600', desconhecido: 'text-muted' } as const;

/** Canais de contato disponíveis: e-mail (cadastrado ou achado no site) e sinal de WhatsApp (sem consultar o WhatsApp). */
export function ChannelBadges({ email, emailFromSite, phone, siteNumbers, linkedin, people, analyzed = true }: { email?: string | null; emailFromSite?: boolean; phone?: string | null; siteNumbers?: string[] | null; linkedin?: string | null; people?: Person[] | null; analyzed?: boolean }) {
  const w = whatsappSignal(phone, siteNumbers ?? []);
  const com = (people ?? []).find((x) => x.role === 'comercial'); const dir = (people ?? []).find((x) => x.role === 'direcao');
  const none = (txt: string) => (analyzed ? txt : 'não analisado');
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <span className={`badge gap-1 ${email ? 'bg-lime/50 text-fg' : 'text-muted'}`} title={email ? `${email}${emailFromSite ? ' (encontrado no site da empresa)' : ''}` : 'Nenhum e-mail encontrado'}><Mail className="h-3 w-3" strokeWidth={1.8} />{email ? (emailFromSite ? 'E-mail (site)' : 'E-mail') : 'Sem e-mail'}</span>
      <span className={`badge gap-1 ${TONE[w.level]}`} title={w.detail}><MessageCircle className="h-3 w-3" strokeWidth={1.8} />{w.label}</span>
      <span className={`badge gap-1 ${phone ? 'bg-lime/50 text-fg' : 'text-muted'}`} title={phone ?? 'Nenhum telefone cadastrado'}><Phone className="h-3 w-3" strokeWidth={1.8} />{phone ? 'Telefone' : 'Sem telefone'}</span>
      <span className={`badge gap-1 ${linkedin ? 'bg-blue-500/10 text-blue-600' : 'text-muted'}`} title={linkedin ?? 'Nenhum LinkedIn encontrado no site'}><Linkedin className="h-3 w-3" strokeWidth={1.8} />{linkedin ? <a href={linkedin} target="_blank" rel="noreferrer noopener" className="underline">LinkedIn</a> : `LinkedIn: ${none('não encontrado')}`}</span>
      <span className={`badge gap-1 ${com ? 'bg-lime/50 text-fg' : 'text-muted'}`} title={com ? `${com.name ? com.name + ' — ' : ''}${com.title}` : 'Nenhum diretor comercial citado no site'}><Briefcase className="h-3 w-3" strokeWidth={1.8} />{com ? `Dir. comercial${com.name ? ': ' + com.name : ''}` : `Dir. comercial: ${none('não encontrado')}`}</span>
      <span className={`badge gap-1 ${dir ? 'bg-lime/50 text-fg' : 'text-muted'}`} title={dir ? `${dir.name ? dir.name + ' — ' : ''}${dir.title}` : 'Nenhum diretor/sócio citado no site'}><UserRound className="h-3 w-3" strokeWidth={1.8} />{dir ? `${dir.title}${dir.name ? ': ' + dir.name : ''}` : `Direção: ${none('não encontrada')}`}</span>
    </div>
  );
}
