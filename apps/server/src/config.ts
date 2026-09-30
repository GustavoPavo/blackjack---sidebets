export interface ServerConfig {
  port: number;
  databasePath: string;
  /** Origens web/nativas autorizadas a chamar a API (CORS). Same-origin não precisa estar aqui. */
  allowedOrigins: string[];
  /** Ferramentas de desenvolvimento (ex.: cancelar rodada). Nunca habilitar em produção. */
  devTools: boolean;
  production: boolean;
}

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost', 'https://localhost', 'capacitor://localhost'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const fromEnv = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    port: Number(env.PORT ?? 3001),
    databasePath: env.DATABASE_PATH ?? './data/blackjack.sqlite',
    allowedOrigins: fromEnv.length ? fromEnv : production ? [] : DEV_ORIGINS,
    devTools: env.ENABLE_DEV_TOOLS === '1' && !production,
    production,
  };
}
