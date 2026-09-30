import type { Preferences } from '@bj/engine';
import { feedback } from './feedback';
import { usePrefs } from './prefs';

/** Preferências salvas por jogador (servidor) e em cache local. */
export function SettingsPanel({ extra }: { extra?: React.ReactNode }) {
  const { prefs, setPrefs } = usePrefs();
  const radio = (value: Preferences['animationSpeed'], label: string) => (
    <label className="opt"><input type="radio" name="speed" checked={prefs.animationSpeed === value} onChange={() => setPrefs({ animationSpeed: value })} /> {label}</label>
  );
  return (
    <div className="settings">
      <label className="opt"><input type="checkbox" checked={prefs.sound} onChange={(e) => { setPrefs({ sound: e.target.checked }); if (e.target.checked) setTimeout(() => feedback.chip(), 0); }} /> Efeitos sonoros</label>
      <label className="opt"><input type="checkbox" checked={prefs.vibration} onChange={(e) => { setPrefs({ vibration: e.target.checked }); if (e.target.checked) setTimeout(() => feedback.tap('medium'), 0); }} /> Vibração</label>
      <fieldset className="opt-group">
        <legend>Velocidade da animação</legend>
        {radio('normal', 'Normal')}
        {radio('fast', 'Rápida')}
      </fieldset>
      <label className="opt">Movimento reduzido
        <select value={prefs.reducedMotion} onChange={(e) => setPrefs({ reducedMotion: e.target.value as Preferences['reducedMotion'] })}>
          <option value="system">Seguir o sistema</option>
          <option value="on">Ligado</option>
          <option value="off">Desligado</option>
        </select>
      </label>
      {extra}
    </div>
  );
}
