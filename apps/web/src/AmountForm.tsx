import { useState } from 'react';
import { formatBRL } from '@bj/engine';

/** Formulário de valor em reais → centavos, com validação do máximo por operação (o servidor valida de novo). */
export function AmountForm({ max, label, onSubmit, onCancel }: {
  max: number; label: string; onCancel: () => void; onSubmit: (cents: number) => void;
}) {
  const [text, setText] = useState('1000');
  const reais = Number(text.replace(',', '.'));
  const cents = Math.round(reais * 100);
  const invalid = !Number.isFinite(reais) || cents <= 0 ? 'Informe um valor positivo.' : cents > max ? `Máximo ${formatBRL(max)} por operação.` : '';
  return (
    <form className="amount-form" onSubmit={(e) => { e.preventDefault(); if (!invalid) onSubmit(cents); }}>
      <label>
        Valor (R$)
        <input aria-label="Valor em reais" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {invalid && <small className="err" role="alert">{invalid}</small>}
      <div className="row">
        <button type="submit" disabled={!!invalid}>{label}</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
