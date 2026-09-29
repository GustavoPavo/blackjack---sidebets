import { describe, it, expect } from 'vitest';
import { card, handValue, isTwoCardBlackjack, Shoe, buildShoe, formatBRL, validateBuyAmount,
  settleBusterLucky, busterLuckyMultiplier } from '../src';

describe('money', () => {
  it('formata centavos', () => {
    expect(formatBRL(500)).toBe('R$ 5,00');
    expect(formatBRL(250)).toBe('R$ 2,50');
    expect(formatBRL(100000)).toBe('R$ 1.000,00');
  });
  it('valida buy-in/rebuy por operação', () => {
    expect(validateBuyAmount(100000)).toBeNull();
    expect(validateBuyAmount(100001)).toBe('EXCEEDS_MAX_BUYIN');
    for (const v of [0, -5, 1.5, NaN, '500', null]) expect(validateBuyAmount(v)).toBe('INVALID_AMOUNT');
  });
});

describe('handValue', () => {
  it('Ás vale 11 ou 1', () => {
    expect(handValue([card('A', 'S'), card('6', 'H')])).toEqual({ total: 17, soft: true, bust: false });
    expect(handValue([card('A', 'S'), card('6', 'H'), card('10', 'D')])).toEqual({ total: 17, soft: false, bust: false });
    expect(handValue([card('A', 'S'), card('A', 'H')]).total).toBe(12);
    expect(handValue([card('K', 'S'), card('Q', 'H'), card('5', 'D')]).bust).toBe(true);
  });
  it('blackjack de duas cartas', () => {
    expect(isTwoCardBlackjack([card('A', 'S'), card('K', 'H')])).toBe(true);
    expect(isTwoCardBlackjack([card('7', 'S'), card('7', 'H'), card('7', 'D')])).toBe(false);
  });
});

describe('shoe', () => {
  it('tem 312 cartas', () => expect(new Shoe(buildShoe(6)).remaining).toBe(312));
  it('stacked entrega na ordem', () => {
    const s = Shoe.stacked([card('A', 'S'), card('2', 'H')]);
    expect(s.draw().rank).toBe('A');
    expect(s.draw().rank).toBe('2');
    expect(() => s.draw()).toThrow('SHOE_EMPTY');
  });
});

describe('Buster Lucky', () => {
  it.each([[3, 1], [4, 3], [5, 6], [6, 30], [7, 100], [8, 200], [12, 200]])(
    '%i cartas paga %i:1', (n, m) => expect(busterLuckyMultiplier(n)).toBe(m));
  it('R$ 2,50 a 30:1 retorna R$ 77,50', () => {
    const r = settleBusterLucky(250, true, 6);
    expect(r.payout).toBe(7750);
    expect(r.profit).toBe(7500);
  });
  it('perde se o dealer não estoura', () => {
    expect(settleBusterLucky(250, false, 5)).toMatchObject({ won: false, payout: 0 });
  });
});
