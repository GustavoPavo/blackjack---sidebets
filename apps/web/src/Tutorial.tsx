import { TUTORIAL_ORDER, TUTORIAL_TEXT, type TutorialStep } from './tutorial';

/** Dica do tutorial (sessão de demonstração separada da carteira real). */
export function TutorialCoach({ step, floating, onSkip, onDone, onRestart }: {
  step: TutorialStep; floating?: boolean; onSkip: () => void; onDone: () => void; onRestart: () => void;
}) {
  const t = TUTORIAL_TEXT[step];
  const n = TUTORIAL_ORDER.indexOf(step) + 1;
  return (
    <aside className={`coach ${floating ? 'floating' : ''}`} role="region" aria-label="Tutorial">
      <div className="coach-head">
        <div><span className="coach-step">{step === 'done' ? 'Concluído' : `Passo ${n} de ${TUTORIAL_ORDER.length - 1}`}</span><h3>{t.title}</h3></div>
        {step !== 'done' && <button className="ghost small" onClick={onSkip}>Pular tutorial</button>}
      </div>
      <p>{t.body}</p>
      {step === 'done' && <div className="row wrap"><button onClick={onDone}>Concluir</button><button className="ghost" onClick={onRestart}>Repetir tutorial</button></div>}
    </aside>
  );
}
