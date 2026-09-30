// Uso: node scripts/check-native-env.mjs native-development|native-test|native-production
// Falha (exit 1) se a URL do backend não servir para o ambiente (ex.: localhost em produção).
import { loadEnv } from 'vite';
import { validateApiUrl } from './apiUrlPolicy.mjs';

const mode = process.argv[2];
const env = loadEnv(mode ?? '', process.cwd(), 'VITE_'); // arquivos .env.* e variáveis de ambiente (estas vencem)
const { ok, problems } = validateApiUrl(mode ?? '', env.VITE_API_BASE_URL);
if (!ok) {
  console.error(`\n✖ Build nativo "${mode}" recusado — VITE_API_BASE_URL = "${env.VITE_API_BASE_URL ?? ''}"`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error('\nDefina a URL em apps/web/.env.' + mode + '.local (não versionado) ou na variável de ambiente VITE_API_BASE_URL. Veja docs/MOBILE.md.\n');
  process.exit(1);
}
console.log(`✔ ${mode}: API em ${env.VITE_API_BASE_URL}`);
