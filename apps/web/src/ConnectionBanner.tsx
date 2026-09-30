/** Aviso de falta de conexão: as ações ficam bloqueadas e o estado é sincronizado ao reconectar. */
export function ConnectionBanner({ online }: { online: boolean }) {
  return (
    <div className="connection-banner" role="status" aria-live="polite">
      <b>{online ? 'Sem resposta do servidor.' : 'Sem conexão.'}</b>
      <span> Suas ações ficam bloqueadas e o jogo volta a sincronizar sozinho quando a conexão voltar. Nada é reenviado em duplicidade.</span>
    </div>
  );
}
