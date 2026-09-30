# Origem dos recursos (sons, imagens, fontes)

Somente créditos fictícios. Nada aqui usa marcas, imagens ou áudio de terceiros.

## Sons — `apps/web/src/audio.ts`
Os efeitos são **sintetizados em tempo real** pela Web Audio API, por código original deste projeto
(osciladores + ruído filtrado). **Não há arquivos de áudio**; portanto não há licença de terceiros a atribuir.

| Efeito | Como é gerado |
|---|---|
| Carta (`playCard`) | ruído branco curto filtrado (passa-banda ~2,6 kHz) + pulso grave triangular |
| Ficha (`playChip`) | dois "tic" triangulares (1850→1300 Hz e 1250→900 Hz) |
| Vitória (`playWin`) | arpejo senoidal C5-E5-G5-C6 |

Volume mestre baixo (0,16). O áudio só inicia após um gesto do usuário (política dos navegadores) e pode ser desligado em
Menu → Configurações → Efeitos sonoros.

## Cartas, fichas, mesa
Desenhadas em HTML/CSS (gradientes, bordas e símbolos Unicode ♠ ♥ ♦ ♣). Sem imagens externas.

## Fontes
Pilha de fontes do sistema (`Inter`, `system-ui`, `Georgia` para títulos). Nenhuma fonte é baixada ou embutida.

## Ícone e tela de abertura do app
Ver `docs/MOBILE.md`: são recursos **provisórios** desenhados para este projeto, até haver uma decisão de marca.
