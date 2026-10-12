import { it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Landing } from '@/app/diagnostico/[token]/Landing';
it('renderiza a landing com mercado, Muvens e proposta', () => {
  const h = renderToString(<Landing name="Clínica Bela" category="Clínica odontológica" website={null} score={70} service="site_institucional" site={null} observations={['Não encontramos um site da empresa']} analyzed rating={4.8} reviews={10} email="a@b.com" />);
  for (const t of ['Panorama do segmento', 'Saúde', 'Quem é a Muvens', 'Proposta de melhorias', 'Site que passa confiança', 'mailto:a@b.com']) expect(h).toContain(t);
});

it('sem site: mensagem direta, preços de referência e botão de contato', () => {
  const h = renderToString(<Landing name="Loja X" category="Loja" website={null} score={80} service="site_institucional" site={null} observations={['Não encontramos um site da empresa']} analyzed whatsapp="5541999998888" prices={{ redes_sociais: { from: 990, unit: 'mensal' }, site_institucional: { from: 3000, unit: 'unico' } }} />);
  for (const t of ['ainda não tem site próprio', 'Hoje, quem procura a empresa no Google não encontra um site', 'A partir de', 'wa.me/5541999998888', 'Valores de referência']) expect(h).toContain(t);
  expect(h).not.toContain('Sem dados');
});
it('sem preços cadastrados: não mostra valores', () => {
  const h = renderToString(<Landing name="Loja X" category="Loja" website={null} score={80} service="site_institucional" site={null} observations={[]} analyzed />);
  expect(h).not.toContain('A partir de'); expect(h).not.toContain('Sob consulta');
});
