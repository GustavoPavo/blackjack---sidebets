/**
 * URL base da API por ambiente (definida em build via VITE_API_BASE_URL; ver docs/MOBILE.md).
 *  - Web servido pelo próprio backend (mesma origem) ou dev com proxy do Vite: vazio.
 *  - App nativo (Capacitor): URL https do servidor hospedado, configurada no build.
 */
const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
export const API_BASE = raw.replace(/\/+$/, '');
export const apiUrl = (path: string) => `${API_BASE}${path}`;
