import { useCallback, useEffect, useState } from 'react';
import { createGuest, type PlayMode } from './api';
import { apiConfigProblems } from './config';
import { loadIdentity, loadIdentityNative, saveIdentity, type Identity } from './identity';
import { isNative } from './native';
import { NameForm } from './NameForm';
import { PrefsProvider } from './prefs';
import { TableScreen } from './TableScreen';

/** Casca de sessão: pede o nome uma única vez (entra como convidado) e abre a mesa. */
export function App() {
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity());
  const [error, setError] = useState('');
  const [mode, setMode] = useState<PlayMode>('real');
  // No app nativo a sessão pode estar só no armazenamento nativo (localStorage da WebView limpo).
  const [booting, setBooting] = useState(() => !loadIdentity() && isNative());
  useEffect(() => {
    if (!booting) return;
    loadIdentityNative().then((id) => { if (id) { saveIdentity(id); setIdentity(id); } }).finally(() => setBooting(false));
  }, [booting]);
  const configProblems = apiConfigProblems();

  const update = useCallback((next: Identity | null) => { saveIdentity(next); setIdentity(next); }, []);

  if (configProblems.length) {
    return (
      <main className="app gate">
        <div className="modal" role="alert">
          <h2>App mal configurado</h2>
          <ul>{configProblems.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="muted">Gere o app novamente com a URL correta do servidor (docs/MOBILE.md).</p>
        </div>
      </main>
    );
  }
  if (booting) return <main className="app gate"><p>Carregando…</p></main>;

  return (
    <PrefsProvider token={identity?.token}>
      {identity?.token ? (
        <TableScreen
          key={mode}
          mode={mode}
          onMode={setMode}
          token={identity.token}
          name={identity.name}
          onIdentity={(id) => update({ ...id, token: identity.token })}
          onSessionLost={() => { setMode('real'); update({ name: identity.name }); }}
        />
      ) : (
        <main className="app gate">
          <div className="modal">
            <NameForm
              title="Bem-vindo ao Blackjack"
              initial={identity?.name ?? ''}
              submitLabel="Começar"
              onSubmit={async (name) => {
                try {
                  const g = await createGuest(name);
                  setError('');
                  update({ id: g.playerId, name, token: g.token });
                } catch { setError('Não foi possível entrar. Verifique a conexão e tente novamente.'); }
              }}
            />
            {error && <p className="err" role="alert">{error}</p>}
            <p className="muted">Créditos fictícios. Seu progresso fica salvo no servidor, neste aparelho.</p>
          </div>
        </main>
      )}
    </PrefsProvider>
  );
}
