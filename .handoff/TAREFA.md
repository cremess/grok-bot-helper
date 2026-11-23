# Tarefa 8 — Ícone de verdade (app, bandeja e instalador)

## Objetivo
Trocar o quadrado azul gerado em código por um ícone desenhado, nítido na bandeja (16/32 px) e no instalador (até 256 px), sem dependências novas.

## Arquivos envolvidos
- Criar: `assets/icon.svg`, `assets/tray.svg`, `scripts/build-icons.js`, `scripts/ico.js`, `test/ico.test.js`
- Alterar: `src/icon.js`, `package.json` (só o script novo `icons`), `src/main.js` (só a opção `icon` das janelas)
- Arquivos GERADOS pelo script (o Claude Code roda o script; você NÃO gera): `assets/icons/tray.png`, `assets/icons/tray@2x.png`, `assets/icons/icon-256.png`, `build/icon.ico`

## Desenho
- `assets/icon.svg` (viewBox `0 0 256 256`): quadrado com cantos bem arredondados (raio ~56) preenchido com gradiente diagonal de `#1080f3` (topo-esquerda) para `#5b3df5` (baixo-direita). No centro, um balão de conversa branco (forma arredondada com "rabinho" embaixo à esquerda) e, dentro dele, um sinal de prompt `›` em azul `#1080f3`, traço grosso e cantos arredondados. Leve brilho/realce sutil no topo é opcional. Estilo flat, moderno, legível em 16 px.
- `assets/tray.svg` (viewBox `0 0 32 32`): versão simplificada para 16/32 px — o mesmo quadrado arredondado com gradiente e só o balão branco com o `›` (traços mais grossos, sem detalhes finos).
- SVG puro, sem fontes, sem imagens embutidas, sem scripts.

## `scripts/ico.js` (puro, sem Electron)
- `buildIco(entries)`: recebe `[{ size, png: Buffer }]` (tamanhos 16–256) e retorna um `Buffer` no formato ICO com entradas PNG (cabeçalho ICONDIR de 6 bytes + ICONDIRENTRY de 16 bytes por imagem; largura/altura `0` significa 256; planes `1`; bitCount `32`; offsets corretos).
- Teste em `test/ico.test.js`: gerar um ICO com 2 PNGs falsos (buffers com a assinatura PNG de 8 bytes + bytes quaisquer) e conferir cabeçalho, quantidade, tamanhos (256 → 0), offsets e que os bytes de cada PNG aparecem no offset indicado.

## `scripts/build-icons.js` (roda com `electron scripts/build-icons.js`)
- Em `app.whenReady()`: para cada saída, renderiza o SVG numa `BrowserWindow` invisível (`show: false`, `width`/`height` = tamanho, `transparent: true`, `frame: false`, `webPreferences: { offscreen: true }`) carregando um `data:text/html` com o SVG ocupando 100% e fundo transparente; espera `did-finish-load` + um pequeno atraso (~150 ms); usa `webContents.capturePage()` e `toPNG()`.
  - Considerar o fator de escala: se o `NativeImage` capturado vier maior que o pedido, redimensionar com `.resize({ width, height, quality: 'best' })`.
- Saídas: `assets/icons/tray.png` (16, de `tray.svg`), `assets/icons/tray@2x.png` (32, de `tray.svg`), `assets/icons/icon-256.png` (256, de `icon.svg`) e `build/icon.ico` com as camadas 16 e 32 (de `tray.svg`) e 48, 64, 128, 256 (de `icon.svg`), montado com `buildIco`.
- Criar as pastas que faltarem; imprimir o que foi gerado; `app.quit()` no fim (e `app.exit(1)` em caso de erro).
- `package.json`: adicionar o script `"icons": "electron scripts/build-icons.js"`.

## `src/icon.js`
- `createTrayIcon()` passa a carregar `assets/icons/tray.png` com `nativeImage.createFromPath` (o Electron pega o `tray@2x.png` sozinho em telas de alta densidade). Se a imagem vier vazia (`isEmpty()`), cair no quadrado azul atual como reserva (manter esse código numa função interna).
- Exportar também `appIconPath()` → caminho de `assets/icons/icon-256.png`.

## `src/main.js`
- Só adicionar `icon: appIconPath()` nas opções das janelas de prompt e de configurações. Nada mais.

## Critérios de aceite
- `npm test` passa (antigos + novo).
- `node --check` em todos os `.js` novos/alterados.
- SVGs válidos (abrir como XML sem erro).

## O que NÃO fazer
- NÃO rodar o script de ícones nem abrir o app (o Claude Code faz isso e revisa o resultado visual).
- NÃO instalar dependências (nada de sharp, png-to-ico etc.).
- NÃO mexer no visual das janelas (é a próxima tarefa).
- NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa.
