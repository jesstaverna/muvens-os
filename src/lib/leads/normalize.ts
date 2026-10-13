// Normaliza o lead recebido por webhook (Meta Lead Ads via Make/Zapier/n8n, formulário próprio…) num formato único.
export interface InboundLead { name: string; email: string | null; phone: string | null; company: string | null; website: string | null; instagram: string | null; source: string; campaign: string | null; ad: string | null; message: string | null; extra: Record<string, string> }

const KEYS: Record<string, string[]> = {
  name: ['name', 'nome', 'full_name', 'fullname', 'nome_completo', 'first_name'],
  email: ['email', 'e-mail', 'e_mail', 'work_email', 'email_corporativo'],
  phone: ['phone', 'phone_number', 'telefone', 'celular', 'whatsapp', 'whatsapp_number', 'mobile'],
  company: ['company', 'company_name', 'empresa', 'nome_da_empresa', 'razao_social'],
  website: ['website', 'site', 'url', 'site_da_empresa', 'link_do_site', 'web_site'],
  instagram: ['instagram', 'instagram_handle', 'perfil_instagram', 'arroba'],
  message: ['message', 'mensagem', 'comments', 'observacao', 'observacoes'],
};
const norm = (k: string) => k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const str = (v: unknown) => { const s = (Array.isArray(v) ? v[0] : v); return s == null ? '' : String(s).trim().slice(0, 500); };

/** Aceita campos soltos ({nome, email…}) ou o formato do Meta ({field_data: [{name, values: []}]}). Devolve null sem nome e sem contato. */
export function normalizeLead(raw: unknown): InboundLead | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const flat: Record<string, string> = {};
  const put = (k: string, v: unknown) => { const t = str(v); if (t) flat[norm(k)] = t; };
  for (const [k, v] of Object.entries(o)) if (typeof v !== 'object' || Array.isArray(v)) put(k, v);
  const fd = o.field_data ?? (o.lead as Record<string, unknown> | undefined)?.field_data;
  if (Array.isArray(fd)) for (const f of fd as { name?: string; values?: unknown[] }[]) if (f?.name) put(f.name, f.values);
  if (o.fields && typeof o.fields === 'object') for (const [k, v] of Object.entries(o.fields as Record<string, unknown>)) put(k, v);
  const take = (field: keyof typeof KEYS) => { for (const k of KEYS[field]) if (flat[k]) { const v = flat[k]; delete flat[k]; return v; } return null; };
  let name = take('name'); const email = take('email'); const phone = take('phone'); const company = take('company');
  let website = take('website'); const instagram = take('instagram'); const message = take('message');
  const first = flat.first_name, last = flat.last_name; if (!name && (first || last)) name = [first, last].filter(Boolean).join(' ');
  const campaign = flat.campaign_name ?? flat.campanha ?? flat.campaign ?? null; const ad = flat.ad_name ?? flat.anuncio ?? flat.ad ?? null;
  const source = flat.source ?? flat.origem ?? flat.platform ?? 'Anúncio';
  for (const k of ['first_name', 'last_name', 'campaign_name', 'campanha', 'campaign', 'ad_name', 'anuncio', 'ad', 'source', 'origem', 'platform', 'id', 'created_time', 'form_id', 'leadgen_id', 'page_id', 'adgroup_id', 'ad_id']) delete flat[k];
  if (website && !/^https?:\/\//i.test(website)) website = /\s/.test(website) || !website.includes('.') ? null : `https://${website}`;
  const mail = email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.toLowerCase() : null;
  const digits = phone ? phone.replace(/\D/g, '') : '';
  const ph = digits.length >= 8 ? phone : null;
  if (!name && !mail && !ph) return null;
  return { name: name || mail?.split('@')[0] || 'Lead sem nome', email: mail, phone: ph, company, website, instagram, source: /instagram|^ig$/i.test(source) ? 'Instagram Ads' : /facebook|meta|^fb$/i.test(source) ? 'Facebook Ads' : source, campaign, ad, message, extra: flat };
}
