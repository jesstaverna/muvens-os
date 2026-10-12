import { describe, expect, it } from 'vitest';
import { classifyPhone, extractWhatsappNumbers, whatsappSignal } from './phone';

describe('classifyPhone', () => {
  it('celulares', () => { for (const n of ['(41) 99780-0552', '+55 41 99780-0552', '5541997800552', '041 99780-0552']) expect(classifyPhone(n).kind, n).toBe('celular'); });
  it('fixos', () => { for (const n of ['(41) 3257-4144', '41 3030-7575', '+554132574144']) expect(classifyPhone(n).kind, n).toBe('fixo'); });
  it('especiais e inválidos', () => { expect(classifyPhone('0800 123 4567').kind).toBe('especial'); expect(classifyPhone('123').kind).toBe('invalido'); expect(classifyPhone(null).kind).toBe('invalido'); });
});

describe('extractWhatsappNumbers', () => {
  it('lê wa.me e api.whatsapp.com', () => {
    const html = `<a href="https://wa.me/5541997800552?text=oi">x</a><a href="https://api.whatsapp.com/send?phone=5541988887777&text=a">y</a><a href="https://wa.me/message/ABCDEF">z</a>`;
    expect(extractWhatsappNumbers(html)).toEqual(['5541997800552', '5541988887777']);
  });
  it('sem links → vazio', () => { expect(extractWhatsappNumbers('<p>oi</p>')).toEqual([]); });
});

describe('whatsappSignal', () => {
  it('confirmado quando o site publica o mesmo número (mesmo com formatação diferente)', () => {
    expect(whatsappSignal('(41) 99780-0552', ['5541997800552']).level).toBe('confirmado');
  });
  it('site com outro número', () => { expect(whatsappSignal('(41) 3257-4144', ['5541988887777']).level).toBe('outro'); });
  it('celular provável, fixo improvável, sem telefone desconhecido', () => {
    expect(whatsappSignal('(41) 99780-0552').level).toBe('provavel'); expect(whatsappSignal('(41) 3257-4144').level).toBe('improvavel'); expect(whatsappSignal(null).level).toBe('desconhecido');
  });
});
