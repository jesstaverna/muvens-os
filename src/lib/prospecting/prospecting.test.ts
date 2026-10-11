import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzeHtml, scoreProspect, unreachable } from './analysis';
import { bodyToHtml, draftFirstEmail, emailFooter, whatsappLink } from './message';
import { mapPlaces } from './places-map';
import { isPrivateIp, normalizeUrl, safeFetchText } from '@/integrations/net-safe';
import { analyzeSite } from '@/integrations/site-analyzer';

const GOOD = `<html><head><title> Clínica   Bela </title><meta name="viewport" content="width=device-width"><meta name="description" content="Clínica de estética em Campinas com tratamentos"><link rel="icon" href="/f.ico"><meta property="og:image" content="/og.png"></head>
<body><a href="https://wa.me/5519999999999">WhatsApp</a><a href="https://www.instagram.com/clinicabela/">insta</a><script>fbq('init','1')</script><form><input type="email" name="email"></form></body></html>`;
const BAD = `<html><head><title>Site</title></head><body>Olá</body></html>`;

describe('analyzeHtml', () => {
  it('detecta sinais presentes', () => {
    const f = analyzeHtml(GOOD, 'https://clinicabela.com.br/');
    expect(f).toMatchObject({ https: true, title: 'Clínica Bela', hasMetaDescription: true, hasViewport: true, hasWhatsappLink: true, hasAdsPixel: true, hasContactForm: true, hasFavicon: true, hasShareImage: true });
    expect(f.socials.instagram).toBe('https://www.instagram.com/clinicabela');
  });
  it('detecta ausências', () => {
    const f = analyzeHtml(BAD, 'http://x.com');
    expect(f).toMatchObject({ https: false, hasViewport: false, hasWhatsappLink: false, hasAdsPixel: false, hasContactForm: false, hasMetaDescription: false });
    expect(f.socials).toEqual({});
  });
});

describe('scoreProspect', () => {
  it('sem site → alta oportunidade e recomenda site', () => {
    const r = scoreProspect({ hasWebsite: false, rating: 4.8, reviews: 100 });
    expect(r.score).toBeGreaterThanOrEqual(45); expect(r.service).toBe('site_institucional'); expect(r.observations[0]).toContain('Não encontramos um site');
  });
  it('site bom → baixa pontuação', () => {
    const r = scoreProspect({ hasWebsite: true, site: analyzeHtml(GOOD, 'https://a.com'), rating: 4.9, reviews: 200 });
    expect(r.score).toBeLessThan(10);
  });
  it('site ruim sem redes → pontua e cita só o que foi observado', () => {
    const r = scoreProspect({ hasWebsite: true, site: analyzeHtml(BAD, 'http://a.com'), rating: 3.5, reviews: 8 });
    expect(r.score).toBeGreaterThan(50); expect(r.score).toBeLessThanOrEqual(100);
    expect(r.observations.every((o) => /Não encontramos|O site|Há poucas|A nota|Não conseguimos/.test(o))).toBe(true);
  });
  it('site inacessível não é tratado como "sem site"', () => {
    const r = scoreProspect({ hasWebsite: true, site: unreachable('HTTP 500') });
    expect(r.observations.join(' ')).toContain('Não conseguimos acessar');
  });
  it('recomenda tráfego quando o que falta é pixel', () => {
    const f = { ...analyzeHtml(GOOD, 'https://a.com'), hasAdsPixel: false };
    expect(scoreProspect({ hasWebsite: true, site: f, rating: 4.9, reviews: 200 }).service).toBe('trafego_pago');
  });
});

describe('mensagens', () => {
  const s = { name: 'Ana', companyLegalName: 'Muvens LTDA', companyDocument: '00.000.000/0001-00', companyAddress: 'Rua B, 20' };
  it('1º e-mail cita observações, sem preço nem promessa, e tem assinatura', () => {
    const scored = scoreProspect({ hasWebsite: false });
    const m = draftFirstEmail({ name: 'Clínica Bela', category: 'clínica de estética', city: 'Campinas' }, scored, s);
    expect(m.body).toContain('Não encontramos um site'); expect(m.body).toContain('Muvens Agência');
    expect(m.body).not.toMatch(/R\$|garant|desconto|prazo de/i);
    expect(m.subject).toContain('Clínica Bela');
  });
  it('rodapé traz identificação, motivo e descadastro', () => {
    const f = emailFooter(s, 'https://app.test/descadastro/abc');
    expect(f.text).toContain('Muvens LTDA'); expect(f.text).toContain('CNPJ 00.000.000/0001-00'); expect(f.text).toContain('https://app.test/descadastro/abc'); expect(f.html).toContain('Não quero mais receber');
  });
  it('escapa HTML do corpo', () => { expect(bodyToHtml('<script>x</script>\nlinha')).toContain('&lt;script&gt;'); });
  it('link de WhatsApp normaliza DDD/DDI e rejeita inválidos', () => {
    expect(whatsappLink('(19) 99999-8888', 'oi')).toBe('https://wa.me/5519999998888?text=oi');
    expect(whatsappLink('+55 19 99999-8888', 'a b')).toBe('https://wa.me/5519999998888?text=a%20b');
    expect(whatsappLink('123', 'x')).toBeNull(); expect(whatsappLink(null, 'x')).toBeNull();
  });
});

describe('Google Places (mapeamento)', () => {
  it('mapeia a resposta e ignora itens sem id/nome', () => {
    const r = mapPlaces({ places: [{ id: 'p1', displayName: { text: 'Clínica A' }, formattedAddress: 'Rua 1', nationalPhoneNumber: '(19) 3333-4444', websiteUri: 'https://a.com', rating: 4.5, userRatingCount: 12, googleMapsUri: 'https://maps/p1', primaryTypeDisplayName: { text: 'Clínica' } }, { id: 'p2' }, {}] });
    expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ place_id: 'p1', name: 'Clínica A', website: 'https://a.com', reviews_count: 12, category: 'Clínica' });
    expect(mapPlaces({})).toEqual([]);
  });
});

describe('net-safe (SSRF)', () => {
  it('classifica IPs privados', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0']) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '200.1.2.3']) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it('normaliza URL e rejeita esquemas perigosos', () => {
    expect(normalizeUrl('clinica.com.br')?.href).toBe('https://clinica.com.br/'); expect(normalizeUrl('javascript:alert(1)')).toBeNull(); expect(normalizeUrl('file:///etc/passwd')).toBeNull(); expect(normalizeUrl('')).toBeNull();
  });
  it('recusa hosts internos por padrão', async () => {
    await expect(safeFetchText('http://127.0.0.1:1/')).rejects.toThrow('não permitido');
    await expect(safeFetchText('http://169.254.169.254/latest/meta-data')).rejects.toThrow('não permitido');
    await expect(safeFetchText('http://localhost/')).rejects.toThrow();
  });
});

describe('analyzeSite (servidor local de teste)', () => {
  let srv: ReturnType<typeof createServer>; let base = '';
  beforeAll(async () => {
    srv = createServer((req, res) => {
      if (req.url === '/good') { res.setHeader('content-type', 'text/html'); res.end(GOOD); }
      else if (req.url === '/redir') { res.statusCode = 302; res.setHeader('location', '/good'); res.end(); }
      else if (req.url === '/big') { res.end('a'.repeat(5_000_000)); }
      else { res.statusCode = 500; res.end('erro'); }
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });
  afterAll(() => { srv.close(); });
  it('segue redirecionamento e analisa', async () => {
    const f = await analyzeSite(`${base}/redir`, { allowPrivate: true });
    expect(f.reachable).toBe(true); expect(f.hasViewport).toBe(true); expect(f.hasWhatsappLink).toBe(true); expect(f.https).toBe(false);
  });
  it('limita o tamanho lido', async () => { const { html } = await safeFetchText(`${base}/big`, { allowPrivate: true, maxBytes: 100_000 }); expect(html.length).toBeLessThan(2_000_000); });
  it('HTTP 500 vira "inacessível" sem lançar', async () => { const f = await analyzeSite(`${base}/x`, { allowPrivate: true }); expect(f.reachable).toBe(false); expect(f.error).toContain('500'); });
  it('analisador público não alcança o localhost', async () => { const f = await analyzeSite(`${base}/good`); expect(f.reachable).toBe(false); });
});
