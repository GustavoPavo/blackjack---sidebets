import { useEffect } from 'react';

/** "Regras e pagamentos": tabela das três side bets + regras da mesa (espelha docs/RULES.md). */
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
        <p>
          Para apostar em qualquer aposta lateral, faça primeiro uma aposta principal de pelo menos R$ 5,00 no mesmo lugar.
          Cada aposta lateral exige no mínimo R$ 2,50. Os valores abaixo indicam o lucro; a aposta vencedora também é devolvida.
        </p>
        <div className="rules-grid">
          <article>
            <h3>23+1</h3>
            <p>Duas cartas iniciais do jogador + carta aberta do dealer. Vale apenas a melhor combinação.</p>
            <dl>
              <dt>Trinca do mesmo naipe</dt><dd>100:1</dd>
              <dt>Sequência do mesmo naipe</dt><dd>40:1</dd>
              <dt>Trinca</dt><dd>30:1</dd>
              <dt>Sequência</dt><dd>10:1</dd>
              <dt>Mesmo naipe</dt><dd>5:1</dd>
            </dl>
            <small>O Ás vale alto ou baixo, mas só formam sequência A-2-3 e Q-K-A (K-A-2 não vale).</small>
          </article>
          <article>
            <h3>Pares</h3>
            <p>Compara as duas cartas iniciais do jogador. Precisam ser do mesmo rank (Q com Q); Q e K não formam par.</p>
            <dl>
              <dt>Par perfeito (mesmo naipe)</dt><dd>25:1</dd>
              <dt>Par da mesma cor (naipes diferentes)</dt><dd>12:1</dd>
              <dt>Par de cores diferentes</dt><dd>6:1</dd>
            </dl>
          </article>
          <article>
            <h3>Buster Lucky</h3>
            <p>Ganha somente se o dealer passar de 21. Conta todas as cartas do dealer ao estourar.</p>
            <dl>
              <dt>3 cartas</dt><dd>1:1</dd>
              <dt>4 cartas</dt><dd>3:1</dd>
              <dt>5 cartas</dt><dd>6:1</dd>
              <dt>6 cartas</dt><dd>30:1</dd>
              <dt>7 cartas</dt><dd>100:1</dd>
              <dt>8 ou mais</dt><dd>200:1</dd>
            </dl>
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
