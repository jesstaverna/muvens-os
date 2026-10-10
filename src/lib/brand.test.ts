import { describe, expect, it } from 'vitest';
import { extOf, knowledgeText } from './brand';

describe('brand', () => {
  it('extrai extensão em minúsculas', () => { expect(extOf('Logo.FINAL.SVG')).toBe('svg'); expect(extOf('semext')).toBe('semext'); });
  it('monta o texto da base de conhecimento sem seções vazias', () => {
    const t = knowledgeText({ client: 'Aurora', tone_of_voice: 'Acolhedor', design_rules: null, colors: [{ name: 'Verde', hex: '#1A7F5A', role: 'primaria' }], fonts: [], links: [], assets: [] });
    expect(t).toContain('MARCA: Aurora'); expect(t).toContain('TOM DE VOZ:\nAcolhedor'); expect(t).toContain('- Verde #1A7F5A (primaria)');
    expect(t).not.toContain('REGRAS DE DESIGN'); expect(t).not.toContain('TIPOGRAFIA');
  });
});
