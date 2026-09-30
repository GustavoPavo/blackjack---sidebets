import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor: empacota o frontend COMPILADO (webDir = dist) dentro do app Android/iOS.
 * O jogo online exige o backend hospedado: a URL vem de VITE_API_BASE_URL no build (ver docs/MOBILE.md).
 *
 * CAP_ENV = development | test | production (padrão: production). Só em "development" o tráfego http
 * (sem TLS) é permitido, para falar com o servidor local/emulador.
 */
const dev = process.env.CAP_ENV === 'development';

const config: CapacitorConfig = {
  // PROVISÓRIO: troque pelo identificador definitivo antes de qualquer publicação (Android applicationId / iOS Bundle ID).
  appId: 'dev.provisorio.blackjackclub',
  appName: 'Blackjack Club',
  webDir: 'dist',
  backgroundColor: '#06291e',
  server: {
    // origem do app: https://localhost (Android) / capacitor://localhost (iOS) — ambas na lista CORS do servidor
    androidScheme: 'https',
    ...(dev ? { cleartext: true } : {}),
  },
  ios: { contentInset: 'never' }, // a página ocupa a tela toda; as áreas seguras são tratadas por env(safe-area-inset-*)
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // escondida pelo app quando a primeira tela estiver pronta (src/native.ts)
      backgroundColor: '#06291e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: { style: 'DARK', backgroundColor: '#06291e' },
  },
};

export default config;
