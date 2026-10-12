import 'server-only';
import { normalizeAddress } from '@/lib/prospecting/address';

export interface OutgoingEmail { from: string; to: string; replyTo?: string; subject: string; text: string; html: string; unsubscribeUrl: string }
export interface EmailProvider { send(m: OutgoingEmail): Promise<{ id: string }> }

/**
 * Provedor Resend (API HTTP). Requer RESEND_API_KEY e domínio de envio verificado (SPF/DKIM) no provedor.
 * Inclui os cabeçalhos List-Unsubscribe (inclusive one-click). NÃO testado contra a API real nesta entrega.
 */
export function resendProvider(apiKey = process.env.RESEND_API_KEY): EmailProvider | null {
  if (!apiKey) return null;
  return {
    async send(m) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: m.from, to: [m.to], reply_to: normalizeAddress(m.replyTo), subject: m.subject, text: m.text, html: m.html,
          headers: { 'List-Unsubscribe': `<${m.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok || !j.id) throw new Error(j.message ?? `Resend respondeu ${res.status}`);
      return { id: j.id };
    },
  };
}
