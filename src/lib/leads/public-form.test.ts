import { beforeEach, describe, expect, it } from 'vitest';
import { _resetRateLimit, allowedOrigin, rateLimited, sourceFromUtm } from './public-form';

describe('formulário público do site', () => {
  it('só aceita o site da Muvens, prévias do Lovable e origens extras da configuração', () => {
    expect(allowedOrigin('https://muvensagencia.com.br')).toBe('https://muvensagencia.com.br');
    expect(allowedOrigin('https://www.muvensagencia.com.br')).toBe('https://www.muvensagencia.com.br');
    expect(allowedOrigin('https://meu-projeto.lovable.app')).toBe('https://meu-projeto.lovable.app');
    expect(allowedOrigin('https://x.lovableproject.com')).toBeTruthy();
    expect(allowedOrigin('https://evil.com')).toBeNull(); expect(allowedOrigin('https://muvensagencia.com.br.evil.com')).toBeNull(); expect(allowedOrigin(null)).toBeNull();
    expect(allowedOrigin('https://lp.parceiro.com', 'https://lp.parceiro.com/')).toBe('https://lp.parceiro.com');
  });
  it('origem pelo link do anúncio', () => {
    expect(sourceFromUtm('instagram', 'paid_social')).toBe('Instagram Ads'); expect(sourceFromUtm('fb', 'cpc')).toBe('Facebook Ads'); expect(sourceFromUtm('google', 'cpc')).toBe('Google Ads');
    expect(sourceFromUtm('instagram', 'bio')).toBe('Instagram (link)'); expect(sourceFromUtm(null, null)).toBe('Site muvensagencia.com.br'); expect(sourceFromUtm('newsletter', 'email')).toBe('newsletter (link)');
  });
  describe('limite por IP', () => {
    beforeEach(() => _resetRateLimit());
    it('bloqueia depois de 6 envios na janela e libera depois', () => {
      const t0 = 1_000_000; for (let i = 0; i < 6; i++) expect(rateLimited('1.1.1.1', t0 + i)).toBe(false);
      expect(rateLimited('1.1.1.1', t0 + 10)).toBe(true); expect(rateLimited('2.2.2.2', t0 + 10)).toBe(false);
      expect(rateLimited('1.1.1.1', t0 + 11 * 60_000)).toBe(false);
    });
  });
});
