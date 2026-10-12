// Sinalização de WhatsApp SEM consultar o WhatsApp (não existe consulta oficial). Só heurística de formato + número publicado pela própria empresa.

export type PhoneKind = 'celular' | 'fixo' | 'especial' | 'invalido';
export interface PhoneInfo { digits: string; kind: PhoneKind }

/** Normaliza para DDD+número (sem +55/0) e classifica pelo formato brasileiro. */
export function classifyPhone(raw: string | null | undefined): PhoneInfo {
  let d = (raw ?? '').replace(/\D/g, '');
  if (!d) return { digits: '', kind: 'invalido' };
  if (/^(0800|0300|0500|4003|4004|4020|3003)/.test(d)) return { digits: d, kind: 'especial' };
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1);      // 0 + DDD
  if (d.length === 11 && d[2] === '9') return { digits: d, kind: 'celular' };
  if (d.length === 10 && /[2-5]/.test(d[2])) return { digits: d, kind: 'fixo' };
  if (d.length === 10 && /[6-9]/.test(d[2])) return { digits: d, kind: 'celular' };    // celular antigo, sem o 9º dígito
  return { digits: d, kind: 'invalido' };
}

/** Extrai números de links de WhatsApp (wa.me, api.whatsapp.com/send?phone=, whatsapp://send?phone=). */
export function extractWhatsappNumbers(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/(?:wa\.me\/(?:message\/)?\+?|(?:api|web)\.whatsapp\.com\/send\/?\?[^"'\s>]*?phone=\+?|whatsapp:\/\/send\?[^"'\s>]*?phone=\+?)(\d{10,15})/gi)) out.add(m[1]);
  return [...out].slice(0, 3);
}

export type WhatsappSignal =
  | { level: 'confirmado'; label: string; detail: string }   // número publicado como WhatsApp no site
  | { level: 'provavel'; label: string; detail: string }
  | { level: 'improvavel'; label: string; detail: string }
  | { level: 'outro'; label: string; detail: string }        // o site publica outro número de WhatsApp
  | { level: 'desconhecido'; label: string; detail: string };

const tail = (d: string) => d.replace(/\D/g, '').slice(-8);

export function whatsappSignal(phone: string | null | undefined, siteNumbers: string[] = []): WhatsappSignal {
  const p = classifyPhone(phone);
  if (p.digits && siteNumbers.some((n) => tail(n) === tail(p.digits))) return { level: 'confirmado', label: 'WhatsApp confirmado no site', detail: 'Este número está publicado como WhatsApp no site da empresa.' };
  if (siteNumbers.length) { const s = classifyPhone(siteNumbers[0]); return { level: 'outro', label: 'WhatsApp no site (outro número)', detail: `O site divulga o WhatsApp ${fmt(s.digits)}${p.digits ? ', diferente do telefone do cadastro' : ''}.` }; }
  if (p.kind === 'celular') return { level: 'provavel', label: 'Celular (provável WhatsApp)', detail: 'Número de celular: costuma ter WhatsApp, mas não é possível confirmar sem o contato.' };
  if (p.kind === 'fixo') return { level: 'improvavel', label: 'Telefone fixo', detail: 'Número fixo: provavelmente sem WhatsApp (só com WhatsApp Business em linha fixa). Prefira e-mail ou ligação.' };
  if (p.kind === 'especial') return { level: 'improvavel', label: 'Número especial (0800/4004)', detail: 'Não costuma ter WhatsApp.' };
  return { level: 'desconhecido', label: phone ? 'Telefone em formato inválido' : 'Sem telefone', detail: 'Não foi possível classificar o número.' };
}

export function fmt(d: string): string {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d.startsWith('55') && d.length >= 12 ? fmt(d.slice(2)) : d;
}
