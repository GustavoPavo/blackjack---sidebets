import { randomInt } from 'node:crypto';

/** RNG criptográfico em [0,1) — o baralho é embaralhado apenas no servidor. */
export const cryptoRng = () => randomInt(0, 2 ** 32) / 2 ** 32;
