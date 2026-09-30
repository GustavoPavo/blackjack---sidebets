// Política da URL do backend por ambiente (usada no build nativo e no início do app).
// Puro JS para rodar em Node (scripts) e no navegador (src/).

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', '10.0.2.2']);
const isLoopback = (h) => LOOPBACK.has(h) || h.endsWith('.localhost') || /^127\./.test(h);
const isPrivateNet = (h) => /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || h.endsWith('.local') || h.endsWith('.internal');
const isPlaceholder = (h) => h.endsWith('.invalid') || h.endsWith('.example') || /(^|\.)example\.(com|org|net)$/.test(h);
const isIpLiteral = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[');

export const NATIVE_MODES = ['native-development', 'native-test', 'native-production'];

/**
 * Valida a URL base da API para um modo de build nativo.
 * @param {string} mode native-development | native-test | native-production
 * @param {string | undefined} rawUrl valor de VITE_API_BASE_URL
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function validateApiUrl(mode, rawUrl) {
  const problems = [];
  const url = (rawUrl ?? '').trim();
  if (!NATIVE_MODES.includes(mode)) return { ok: false, problems: [`modo desconhecido: ${mode}`] };
  if (!url) return { ok: false, problems: ['VITE_API_BASE_URL está vazio: o app nativo precisa da URL do servidor hospedado.'] };
  let u;
  try { u = new URL(url); } catch { return { ok: false, problems: [`URL inválida: ${url}`] }; }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' && u.protocol !== 'http:') problems.push('use http(s)://');
  if (u.username || u.password) problems.push('a URL não pode conter usuário/senha');
  if (u.search || u.hash || (u.pathname && u.pathname !== '/')) problems.push('informe só a origem (sem caminho, query ou #), ex.: https://api.seudominio.com');
  if (mode === 'native-development') return { ok: problems.length === 0, problems };
  // teste e produção
  if (u.protocol !== 'https:') problems.push('teste/produção exigem https://');
  if (isLoopback(host)) problems.push(`"${host}" é endereço local: não pode ser usado em ${mode === 'native-production' ? 'produção' : 'teste'}`);
  if (isPrivateNet(host)) problems.push(`"${host}" é rede privada: não pode ser usado em ${mode === 'native-production' ? 'produção' : 'teste'}`);
  if (isPlaceholder(host)) problems.push(`"${host}" é um valor de exemplo/placeholder: configure a URL real do servidor`);
  if (mode === 'native-production' && isIpLiteral(host)) problems.push('produção exige um nome de domínio com certificado TLS, não um endereço IP');
  return { ok: problems.length === 0, problems };
}
