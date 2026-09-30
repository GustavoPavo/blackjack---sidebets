import { loadConfig } from './config';
import { openDatabase } from './db/sqlite';
import { createApp } from './app';
import { GameService } from './gameService';
import { SqliteRepository } from './sqliteRepository';
import { cryptoRng } from './rng';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const repo = new SqliteRepository(db);
const service = new GameService(repo, { tableOptions: { rng: cryptoRng } });
const server = createApp({ service, config }).listen(config.port, () => {
  console.log(`Blackjack (créditos fictícios) em http://localhost:${config.port} · banco: ${config.databasePath}`);
  if (config.devTools) console.log('Atenção: ferramentas de desenvolvimento habilitadas.');
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { server.close(() => { repo.close(); process.exit(0); }); });
}
