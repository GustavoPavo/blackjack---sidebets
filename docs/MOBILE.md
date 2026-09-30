# App Android / iOS (Capacitor)

O frontend compilado é embutido num app nativo (Capacitor 8). **Somente créditos fictícios**; sem anúncios, compras, multiplayer ou notificações promocionais.

> **Estado:** projetos `android/` e `ios/` gerados e sincronizados. **Não foram compilados nem testados em aparelho/emulador neste ambiente** (não há Android SDK nem Xcode aqui). O app **não está publicado nem aprovado** em nenhuma loja. Ícone e tela de abertura são **provisórios** (`apps/web/assets/README.md`). O `appId` (`dev.provisorio.blackjackclub`) também é provisório.

## Arquitetura
O app carrega o frontend localmente e fala com o **servidor hospedado** (fonte de verdade: carteira, rodadas, histórico). Sem servidor acessível o app abre, mostra "sem conexão" e bloqueia ações; ao voltar (rede ou segundo plano) consulta o estado no servidor e **nunca reenvia uma ação** já processada (comandos têm id idempotente). Não há sincronização entre dispositivos: a sessão de convidado é por aparelho (token em `Preferences` nativo, espelhado no localStorage).

## Ambientes e URL do backend
Modos Vite, arquivos `apps/web/.env.<modo>`:

| Modo | Script | URL | Regras |
|---|---|---|---|
| `native-development` | `npm run build:native:development -w @bj/web` | `http://10.0.2.2:3001` (emulador Android → host) | http e rede local permitidos |
| `native-test` | `build:native:test` | https do servidor de teste | http/localhost/rede privada recusados |
| `native-production` | `build:native:production` | https do servidor real | idem + IP literal recusado |

Os arquivos versionados de teste/produção têm **placeholders `.invalid`** que o build recusa. Informe a URL real sem versionar:
```bash
VITE_API_BASE_URL=https://meu-servidor.exemplo.com npm run build:native:production -w @bj/web
# ou em apps/web/.env.native-production.local (ignorado pelo git)
```
`npm run cap:check:production -w @bj/web` valida a URL sem compilar. Em produção não há `localhost` embutido.

### Servidor (CORS)
Defina `ALLOWED_ORIGINS` com as origens do WebView: `https://localhost` (Android) e `capacitor://localhost` (iOS), além do site web se houver. Em produção o padrão é vazio (nada liberado). Use HTTPS no servidor; `ENABLE_DEV_TOOLS` não deve ser ligado.

## Android no Linux
Requisitos: Node ≥ 22.13, JDK 21, Android SDK (Android Studio ou cmdline-tools; plataformas e build-tools conforme `android/variables.gradle`), `ANDROID_HOME` definido.
```bash
npm install
npm run dev -w @bj/server                     # servidor em :3001 (emulador o vê como 10.0.2.2)
npm run build:native:development -w @bj/web   # build + cap sync
cd apps/web
npx cap run android                           # emulador/aparelho via USB
# ou: npx cap open android  (Android Studio) — ou: cd android && ./gradlew assembleDebug
```
Em aparelho físico use a URL da máquina na rede (`VITE_API_BASE_URL=http://192.168.x.x:3001 npm run build:native:development`) — somente em desenvolvimento.

## iOS
Exige **macOS + Xcode** (ou um serviço de build em macOS/CI; também conta Apple Developer para rodar em aparelho/distribuir). No Linux não é possível compilar.
```bash
npm install && npm run build:native:development -w @bj/web
cd apps/web && npx cap open ios    # Xcode: escolher equipe/assinatura e rodar
```
(CocoaPods/SPM é resolvido pelo Xcode conforme o projeto gerado.) Nada foi validado em iOS aqui.

## Ícone e abertura
Fontes em `apps/web/assets/source/*.svg`, PNGs em `apps/web/assets/`. Regenerar os recursos nativos: `npm run assets:generate -w @bj/web`. Substitua por arte definitiva antes de publicar.

## Plugins
App, Network, Preferences, SplashScreen, StatusBar, Haptics (vibração nativa; no navegador usa `navigator.vibrate` ou é ignorada sem erro).

## Antes de publicar (não feito)
Arte e `appId` definitivos, assinatura, política de privacidade, classificação etária e revisão das políticas de cada loja para jogos de cassino simulados (podem exigir classificação/declarações específicas). Nada aqui afirma publicação ou aprovação.
