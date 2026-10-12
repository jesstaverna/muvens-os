import { it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Landing } from '@/app/diagnostico/[token]/Landing';
it('renderiza a landing com mercado, Muvens e proposta', () => {
  const h = renderToString(<Landing name="Clínica Bela" category="Clínica odontológica" website={null} score={70} service="site_institucional" site={null} observations={['Não encontramos um site da empresa']} analyzed rating={4.8} reviews={10} email="a@b.com" />);
  for (const t of ['Panorama do segmento', 'Saúde', 'Quem é a Muvens', 'Proposta de melhorias', 'Site que passa confiança', 'mailto:a@b.com']) expect(h).toContain(t);
});
