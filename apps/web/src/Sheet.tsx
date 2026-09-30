import { useEffect, type ReactNode } from 'react';

/** Painel sobreposto (menu, formulários): fecha com Esc, toque no fundo ou botão. */
export function Sheet({ title, onClose, side = 'center', children }: {
  title: string; onClose: () => void; side?: 'left' | 'center'; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`sheet-backdrop ${side}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={`sheet ${side}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="ghost small" onClick={onClose} aria-label={`Fechar ${title}`}>✕</button></header>
        <div className="sheet-body">{children}</div>
      </aside>
    </div>
  );
}
