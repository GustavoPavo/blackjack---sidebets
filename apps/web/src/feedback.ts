import type { Preferences } from '@bj/engine';
import { playCard, playChip, playWin } from './audio';
import { haptic, type HapticKind } from './haptics';

/** Efeitos de som e vibração, respeitando as preferências do jogador. */
let current: Pick<Preferences, 'sound' | 'vibration'> = { sound: true, vibration: true };
export const setFeedbackPrefs = (p: Pick<Preferences, 'sound' | 'vibration'>) => { current = p; };

export const feedback = {
  card() { if (current.sound) playCard(); },
  chip() { if (current.sound) playChip(); if (current.vibration) void haptic('light'); },
  win() { if (current.sound) playWin(); if (current.vibration) void haptic('success'); },
  tap(kind: HapticKind = 'light') { if (current.vibration) void haptic(kind); },
};
