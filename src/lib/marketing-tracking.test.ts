import { describe, expect, it } from 'vitest';
import { buildPaidSocialUrl, monthlyToDaily, safeCampaignSlug } from './marketing-tracking';

describe('tracking de campanhas', () => {
 it('normaliza UTMs sem perder parâmetros já existentes', () => {
  const out = buildPaidSocialUrl('https://muvensagencia.com.br/diagnostico-gratuito?ref=menu&utm_source=old',
   'instagram', 'Diagnóstico Grátis — Sites 2026', 'Criativo B — Versão 2');
  const url = new URL(out!);
  expect(url.searchParams.get('ref')).toBe('menu');
  expect(url.searchParams.getAll('utm_source')).toEqual(['instagram']);
  expect(url.searchParams.get('utm_medium')).toBe('paid_social');
  expect(url.searchParams.get('utm_campaign')).toBe('diagnostico-gratis-sites-2026');
  expect(url.searchParams.get('utm_content')).toBe('criativo-b-versao-2');
 });
 it('nega scripts, dados incompletos e credenciais', () => {
  expect(buildPaidSocialUrl('javascript:alert(1)', 'facebook', 'campaign', 'ad')).toBeNull();
  expect(buildPaidSocialUrl('https://user:pass@example.com', 'facebook', 'campaign', 'ad')).toBeNull();
  expect(buildPaidSocialUrl('https://example.com', 'facebook', '', 'ad')).toBeNull();
  expect(safeCampaignSlug('  Página linda!  ')).toBe('pagina-linda');
 });
 it('calcula média diária de referência, não orçamento configurado na Meta', () => {
  expect(monthlyToDaily(800, 30)).toBe(26.67);
  expect(monthlyToDaily(600, 30)).toBe(20);
  expect(monthlyToDaily(1000, 30)).toBe(33.33);
  expect(monthlyToDaily(800, 0)).toBeNull();
 });
});
