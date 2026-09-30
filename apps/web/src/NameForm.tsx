import { useState } from 'react';

export function NameForm({ initial = '', title, submitLabel, onSubmit, onCancel }: {
  initial?: string; title?: string; submitLabel: string; onSubmit: (name: string) => void; onCancel?: () => void;
}) {
  const [name, setName] = useState(initial);
  const ok = name.trim().length > 0;
  return (
    <form className="name-form" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(name.trim().slice(0, 20)); }}>
      {title && <h2>{title}</h2>}
      <label>
        Seu nome
        <input aria-label="Seu nome" autoFocus maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row">
        <button type="submit" disabled={!ok}>{submitLabel}</button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}
