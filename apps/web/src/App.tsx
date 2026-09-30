import { useCallback, useState } from 'react';
import { createGuest, type PlayMode } from './api';
import { loadIdentity, saveIdentity, type Identity } from './identity';
import { NameForm } from './NameForm';
import { PrefsProvider } from './prefs';
import { TableScreen } from './TableScreen';

/** Casca de sessão: pede o nome uma única vez (entra como convidado) e abre a mesa. */
export function App() {
  const [identity, setIdentity] = useState<Identity | null>(() => loadIdentity());
  const [error, setError] = useState('');
  const [mode, setMode] = useState<PlayMode>('real');

  const update = useCallback((next: Identity | null) => { saveIdentity(next); setIdentity(next); }, []);

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
