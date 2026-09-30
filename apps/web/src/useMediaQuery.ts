import { useEffect, useState } from 'react';

const supported = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** `matchMedia` reativo. Sem suporte (ex.: testes) → false. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (supported() ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!supported()) return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}

/**
 *  - focus:   celular na vertical → dealer + mão do lugar selecionado em destaque, controles embaixo.
 *  - compact: celular na horizontal → mesa completa com os 5 lugares, compacta.
 *  - table:   desktop/tablet → mesa completa.
 */
export type LayoutMode = 'focus' | 'compact' | 'table';
export function useLayoutMode(): LayoutMode {
  const portraitPhone = useMediaQuery('(max-width: 700px) and (orientation: portrait)');
  const landscapePhone = useMediaQuery('(orientation: landscape) and (max-height: 520px)');
  return portraitPhone ? 'focus' : landscapePhone ? 'compact' : 'table';
}
