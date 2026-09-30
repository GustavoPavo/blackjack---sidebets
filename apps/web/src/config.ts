import { validateApiUrl } from '../scripts/apiUrlPolicy.mjs';
import { isNative } from './native';

/**
 * URL base da API por ambiente (definida em build via VITE_API_BASE_URL; ver docs/MOBILE.md).
 *  - Web servido pelo próprio backend (mesma origem) ou dev com proxy do Vite: vazio.
 *  - App nativo (Capacitor): URL https do servidor hospedado, configurada no build (modos native-*).
 */
const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
export const API_BASE = raw.replace(/\/+$/, '');
export const apiUrl = (path: string) => `${API_BASE}${path}`;

/**
 * Problemas de configuração que impedem o app nativo de funcionar (ex.: sem URL do servidor). Em vez de
 * chamar a rede com uma URL errada (ex.: localhost), o app mostra uma tela de erro clara.
 */
export function apiConfigProblems(mode: string = import.meta.env.MODE, base: string = API_BASE, native: boolean = isNative()): string[] {
  if (!native) return [];
  if (!base) return ['Este app não foi compilado com a URL do servidor (VITE_API_BASE_URL).'];
  const m = mode.startsWith('native-') ? mode : 'native-production';
  return validateApiUrl(m, base).problems;
}
