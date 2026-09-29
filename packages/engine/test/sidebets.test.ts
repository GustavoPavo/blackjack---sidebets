import { describe, it, expect } from 'vitest';
import { c } from './helpers';
import { classify23Plus1, classifyPair, settle23Plus1, settlePairs, isStraight } from '../src';

const cls = (a: string, b: string, d: string) => classify23Plus1([c(a), c(b)], c(d));

describe('23+1', () => {
  it('categorias e pagamentos', () => {
    expect(cls('7H', '7H', '7H')).toBe('suitedTrips');
    expect(cls('7H', '7S', '7D')).toBe('threeOfAKind');
    expect(cls('4H', '5H', '6H')).toBe('straightFlush');
    expect(cls('4H', '5S', '6H')).toBe('straight');
    expect(cls('2H', '9H', 'KH')).toBe('flush');
    expect(cls('2H', '9S', 'KH')).toBeNull();
    expect(settle23Plus1(250, [c('7H'), c('7H')], c('7H')).payout).toBe(250 * 101);
    expect(settle23Plus1(250, [c('4H'), c('5H')], c('6H')).payout).toBe(250 * 41);
    expect(settle23Plus1(250, [c('7H'), c('7S')], c('7D')).payout).toBe(250 * 31);
    expect(settle23Plus1(250, [c('4H'), c('5S')], c('6H')).payout).toBe(250 * 11);
    expect(settle23Plus1(250, [c('2H'), c('9H')], c('KH')).payout).toBe(250 * 6);
    expect(settle23Plus1(250, [c('2H'), c('9S')], c('KH'))).toMatchObject({ won: false, payout: 0 });
  });
  it('prioridade: apenas a maior categoria (trips naipados > straight flush > trips > straight > flush)', () => {
    // 3 cartas iguais e do mesmo naipe também formam flush, mas paga só suited trips
    expect(cls('9S', '9S', '9S')).toBe('suitedTrips');
    // straight flush também é flush e straight
    expect(cls('10D', 'JD', 'QD')).toBe('straightFlush');
  });
  it('sequências com Ás: só A-2-3 e Q-K-A; Ás alto e baixo; K-A-2 não vale', () => {
    expect(isStraight([c('AS'), c('2H'), c('3D')])).toBe(true);
    expect(isStraight([c('QS'), c('KH'), c('AD')])).toBe(true);
    expect(isStraight([c('KS'), c('AH'), c('2D')])).toBe(false);
    expect(isStraight([c('JS'), c('QH'), c('AD')])).toBe(false);
    expect(isStraight([c('AS'), c('3H'), c('4D')])).toBe(false);
    expect(cls('AH', '2H', '3H')).toBe('straightFlush');
    expect(cls('QS', 'KS', 'AS')).toBe('straightFlush');
    expect(cls('KS', 'AS', '2S')).toBe('flush');
  });
  it('ordem das cartas não importa; sequência comum', () => {
    expect(cls('6H', '4S', '5D')).toBe('straight');
    expect(cls('JH', 'KS', 'QD')).toBe('straight');
    expect(cls('2H', '3S', '5D')).toBeNull();
  });
});

describe('Pares', () => {
  it('Perfect / Coloured / Red-Black e pagamentos', () => {
    expect(classifyPair(c('QH'), c('QH'))).toBe('perfect');
    expect(classifyPair(c('QH'), c('QD'))).toBe('coloured');
    expect(classifyPair(c('QS'), c('QC'))).toBe('coloured');
    expect(classifyPair(c('QH'), c('QS'))).toBe('redBlack');
    expect(settlePairs(250, c('QH'), c('QH')).payout).toBe(250 * 26);
    expect(settlePairs(250, c('QH'), c('QD')).payout).toBe(250 * 13);
    expect(settlePairs(250, c('QH'), c('QS')).payout).toBe(250 * 7);
  });
  it('par exige o mesmo rank: Q-K não é par, 10-K não é par', () => {
    expect(classifyPair(c('QH'), c('KH'))).toBeNull();
    expect(classifyPair(c('10S'), c('KS'))).toBeNull();
    expect(settlePairs(250, c('QH'), c('KH'))).toMatchObject({ won: false, payout: 0 });
  });
});
