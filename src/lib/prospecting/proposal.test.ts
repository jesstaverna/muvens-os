import { describe, it, expect } from 'vitest';
import { buildProposal } from './proposal';
import { buildReport } from './report';
import { segmentFor } from './market';

describe('proposta e mercado', () => {
  it('sem site → começa por site', () => {
    const r = buildReport({ name: 'X', site: null, score: 70, observations: [], analyzed: true, service: 'site_institucional' });
    expect(buildProposal(r)[0].service).toBe('site_institucional');
  });
  it('tudo ok → consultoria', () => {
    expect(buildProposal({ headline: '', level: 'baixa', score: 5, pillars: [], hasSite: true, reachable: true, b2bStructured: false, opportunities: [], service: null, strengths: [] })[0].service).toBe('consultoria');
  });
  it('segmento por categoria', () => {
    expect(segmentFor('Clínica odontológica', null).key).toBe('saude');
    expect(segmentFor('Metalúrgica', 'Metalúrgica (Curitiba)').key).toBe('industria');
    expect(segmentFor('Loja de materiais de construção', 'Sinopema S/A Ind e Com de Madeiras').key).toBe('construcao');
    expect(segmentFor('xyz').key).toBe('geral');
  });
});

describe('perfil B2B estruturado', () => {
  const site = { reachable: true, https: true, hasMetaDescription: true, hasViewport: true, hasWhatsappLink: true, hasAdsPixel: true, hasContactForm: true, hasFavicon: true, hasShareImage: true, socials: { linkedin: 'https://linkedin.com/company/x' }, contacts: [{ email: 'compras@x.com.br', kind: 'compras' }] };
  it('indústria com compras/LinkedIn recebe RD Marketing, automação e IA', () => {
    const r = buildReport({ name: 'X', category: 'Metalúrgica', website: 'https://x.com.br', site, score: 30, observations: [], analyzed: true });
    expect(r.b2bStructured).toBe(true); const sv = buildProposal(r).map((x) => x.service);
    expect(sv).toEqual(expect.arrayContaining(['rd_marketing', 'automacao', 'ia_aplicada']));
  });
  it('varejo ou sem estrutura visível não recebe', () => {
    expect(buildReport({ name: 'X', category: 'Padaria', website: 'https://x.com.br', site, score: 30, observations: [], analyzed: true }).b2bStructured).toBe(false);
    expect(buildReport({ name: 'X', category: 'Metalúrgica', website: 'https://x.com.br', site: { ...site, socials: {}, contacts: [] }, score: 30, observations: [], analyzed: true }).b2bStructured).toBe(false);
  });
});
