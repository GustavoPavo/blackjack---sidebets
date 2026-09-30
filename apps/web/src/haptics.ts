/**
 * Vibração. No app nativo (Capacitor) usa o plugin @capacitor/haptics; no navegador usa
 * `navigator.vibrate` quando existir. Nunca lança erro: sem suporte, simplesmente não faz nada.
 */
export type HapticKind = 'light' | 'medium' | 'success' | 'warning';

const WEB_PATTERN: Record<HapticKind, number | number[]> = { light: 12, medium: 25, success: [18, 40, 28], warning: [40, 60, 40] };

function isNative(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch { return false; }
}

export async function haptic(kind: HapticKind): Promise<void> {
  try {
    if (isNative()) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (kind === 'success') await Haptics.notification({ type: NotificationType.Success });
      else if (kind === 'warning') await Haptics.notification({ type: NotificationType.Warning });
      else await Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(WEB_PATTERN[kind]);
  } catch { /* sem suporte ou bloqueado: ignora */ }
}
