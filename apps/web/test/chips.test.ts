import { describe, it, expect } from 'vitest';
import { CHIP_VALUES, decomposeChips } from '../src/chips';
import { timingFor, ANIMATION } from '../src/usePresentation';
import { cardLabel } from '../src/CardView';

describe('fichas', () => {
  it('seis valores distintos, em centavos', () => {
    expect([...CHIP_VALUES]).toEqual([250, 500, 1000, 2500, 5000, 10000]);
  });
  it('decompõe um valor das maiores para as menores fichas', () => {
    expect(decomposeChips(500)).toEqual([{ value: 500, count: 1 }]);
    expect(decomposeChips(1750)).toEqual([{ value: 1000, count: 1 }, { value: 500, count: 1 }, { value: 250, count: 1 }]);
    expect(decomposeChips(30000)).toEqual([{ value: 10000, count: 3 }]);
    expect(decomposeChips(0)).toEqual([]);
  });
  it('a soma das fichas é sempre o valor total (resto vira ficha avulsa)', () => {
    for (const a of [250, 500, 750, 1234, 2500, 12_750, 99_999]) {
      expect(decomposeChips(a).reduce((s, c) => s + c.value * c.count, 0)).toBe(a);
    }
  });
});

describe('velocidade e movimento reduzido', () => {
  it('rápida = metade; movimento reduzido limita os tempos', () => {
    const n = timingFor('normal', false);
    const f = timingFor('fast', false);
    expect(n).toEqual(ANIMATION);
    expect(f.stepMs).toBe(n.stepMs / 2);
    const r = timingFor('normal', true);
    expect(r.stepMs).toBeLessThanOrEqual(140);
    expect(r.stepMs).toBeLessThan(n.stepMs);
  });
});

describe('cartas', () => {
  it('rótulos acessíveis em português', () => {
    expect(cardLabel({ rank: 'A', suit: 'S' })).toBe('Ás de espadas');
    expect(cardLabel({ rank: 'Q', suit: 'H' })).toBe('Dama de copas');
    expect(cardLabel({ rank: '10', suit: 'D' })).toBe('10 de ouros');
    expect(cardLabel({ rank: 'K', suit: 'C' })).toBe('Rei de paus');
  });
});
