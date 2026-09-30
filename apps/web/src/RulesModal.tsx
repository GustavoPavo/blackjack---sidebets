import { useEffect } from 'react';
import { MIN_MAIN_BET, MIN_SIDE_BET, formatBRL, type Card } from '@bj/engine';
import { CardView } from './CardView';
import { ACE_STRAIGHTS, EXAMPLES_23, EXAMPLES_PAIRS, NOT_A_PAIR, busterRows } from './ruleExamples';

const BET = MIN_SIDE_BET; // exemplos de valores com a aposta mínima de side bet

function Hand({ cards, labels }: { cards: Card[]; labels?: string[] }) {
  return (
    <span className="ex-cards">
      {cards.map((c, i) => (
        <span key={i} className="ex-card">
          <CardView card={c} fly={false} />
          {labels && <small>{labels[i]}</small>}
        </span>
      ))}
    </span>
  );
}

const money = (ratio: number) => `Aposta ${formatBRL(BET)} → lucro ${formatBRL(BET * ratio)} · retorno total ${formatBRL(BET * (ratio + 1))}`;

/** "Regras e pagamentos": exemplos visuais com cartas (gerados a partir das regras implementadas no motor). */
export function RulesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="rules-modal" role="dialog" aria-modal="true" aria-label="Regras e pagamentos">
        <header>
          <div><span className="eyebrow">GUIA DA MESA</span><h2>Regras e pagamentos</h2></div>
          <button className="ghost" onClick={onClose} aria-label="Fechar regras">✕</button>
        </header>
        <p className="profit-note">
          <strong>O pagamento indicado (N:1) é o LUCRO</strong>, além da devolução da aposta vencedora. Exemplo: {formatBRL(BET)} pagos a 30:1
          dão lucro de {formatBRL(BET * 30)} e retorno total de {formatBRL(BET * 31)}. Apostas perdedoras não devolvem nada.
        </p>
        <p>
          Para apostar em qualquer aposta lateral, faça primeiro uma aposta principal de pelo menos {formatBRL(MIN_MAIN_BET)} no mesmo lugar.
          Cada aposta lateral exige no mínimo {formatBRL(MIN_SIDE_BET)}.
        </p>
        <div className="rules-grid">
          <article aria-label="23+1">
            <h3>23+1</h3>
            <p>Suas duas cartas iniciais + a carta aberta do dealer. Vale apenas a melhor combinação.</p>
            <ul className="examples">
              {EXAMPLES_23.map((e) => (
                <li key={e.category}>
                  <Hand cards={[...e.player, e.dealer]} labels={['Você', 'Você', 'Dealer']} />
                  <span className="ex-text"><b>{e.label}</b> <em className="ratio">{e.ratio}:1</em><small>{money(e.ratio)}</small></span>
                </li>
              ))}
            </ul>
            <small>O Ás vale alto ou baixo, mas só formam sequência <b>A-2-3</b> e <b>Q-K-A</b>; <b>K-A-2 não vale</b>.</small>
            <ul className="examples ace">
              {ACE_STRAIGHTS.map((e) => (
                <li key={e.label} className={e.valid ? '' : 'invalid'}>
                  <Hand cards={[...e.player, e.dealer]} />
                  <span className="ex-text"><b>{e.label}</b> <small>{e.valid ? 'sequência válida' : 'não é sequência'}</small></span>
                </li>
              ))}
            </ul>
          </article>
          <article aria-label="Pares">
            <h3>Pares</h3>
            <p>Suas duas cartas iniciais. Precisam ter o mesmo rank (Q com Q); Q e K não formam par.</p>
            <ul className="examples">
              {EXAMPLES_PAIRS.map((e) => (
                <li key={e.category}>
                  <Hand cards={e.cards} />
                  <span className="ex-text"><b>{e.label}</b> <em className="ratio">{e.ratio}:1</em><small>{e.note}</small><small>{money(e.ratio)}</small></span>
                </li>
              ))}
              <li className="invalid">
                <Hand cards={NOT_A_PAIR} />
                <span className="ex-text"><b>Não é par</b> <small>ranks diferentes (Q e K)</small></span>
              </li>
            </ul>
          </article>
          <article aria-label="Buster Lucky">
            <h3>Buster Lucky</h3>
            <p>Ganha somente se o dealer passar de 21. Conta todas as cartas do dealer quando ele estoura.</p>
            <ul className="examples buster">
              {busterRows(BET).map((r) => (
                <li key={r.cards}>
                  <span className="ex-cards mini" aria-hidden="true">{Array.from({ length: Math.min(r.cards, 8) }, (_, i) => <i key={i} className="mini-back" />)}</span>
                  <span className="ex-text"><b>{r.cards}{r.plus ? ' ou mais' : ''} cartas</b> <em className="ratio">{r.ratio}:1</em><small>{money(r.ratio)}</small></span>
                </li>
              ))}
            </ul>
          </article>
        </div>
        <p className="rules-note">
          Blackjack natural paga 3:2. Dealer para no soft 17. Insurance só é oferecido com Ás aberto, custa metade da aposta principal e paga 2:1.
          A mesa não usa peek: se o dealer tiver blackjack, leva tudo o que foi apostado (inclusive Double e Split); blackjack do jogador empata.
          O jogo usa 6 baralhos e permite até 3 splits (4 mãos). Surrender só como primeira decisão e devolve metade da aposta.
          Todos os valores são créditos fictícios.
        </p>
      </section>
    </div>
  );
}
