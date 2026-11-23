# Tarefa 11 — Instalador .exe e primeira execução sem atrito (para amigos)

## Contexto
O Pedro vai distribuir o app para amigos. A instalação e a configuração têm de ser **seamless**: instalar, e o app já estar funcionando e explicando o básico. O `electron-builder@26.18.1` **já foi instalado** pelo Claude Code (está em `devDependencies`; motivo registrado: gerar o instalador NSIS). Não instale mais nada.

## Arquivos envolvidos
- Alterar: `package.json` (bloco `build` e scripts), `src/main.js`, `src/settings/settings.html|css|js`, `.gitignore`
- Criar: `src/lib/first-run.js`, `test/first-run.test.js`

## 1. Empacotamento (`package.json`)
- `"productName": "GrokBot Assistant"` no topo do `package.json` e `"author": "GrokBot Assistant"`.
- Script `"dist": "electron-builder --win nsis --x64"`.
- Bloco `"build"`:
  ```json
  {
    "appId": "app.grokbot.assistant",
    "productName": "GrokBot Assistant",
    "directories": { "output": "dist", "buildResources": "build" },
    "files": ["src/**/*", "assets/icons/**/*", "package.json"],
    "asar": true,
    "win": { "target": [{ "target": "nsis", "arch": ["x64"] }], "icon": "build/icon.ico" },
    "nsis": {
      "oneClick": true,
      "perMachine": false,
      "runAfterFinish": true,
      "createStartMenuShortcut": true,
      "createDesktopShortcut": false,
      "shortcutName": "GrokBot Assistant",
      "deleteAppDataOnUninstall": false,
      "artifactName": "GrokBot-Assistant-Setup-${version}.exe"
    }
  }
  ```
- `.gitignore`: garantir `dist/` (já existe) — não versionar o instalador.

## 2. Pasta de dados estável (`src/main.js`)
- Logo no início (antes de `requestSingleInstanceLock` e de qualquer `getPath('userData')`):
  `app.setPath('userData', path.join(app.getPath('appData'), 'grokbot-assistant'));`
  Motivo: com `productName`, o Electron mudaria a pasta para `GrokBot Assistant` e as configurações atuais seriam perdidas.
- `app.setAppUserModelId('app.grokbot.assistant')` em `whenReady` (necessário para os balões/notificações no Windows).

## 3. Primeira execução (`src/lib/first-run.js`, puro, sem Electron)
Exportar:
- `FALLBACK_SHORTCUTS = ['Alt+Space', 'Ctrl+Shift+Space', 'Alt+Shift+G', 'Ctrl+Alt+G']`
- `pickShortcut(preferred, tryRegister)` → `{ shortcut, changed }`: tenta `preferred`; se `tryRegister(preferred)` for falso, tenta os da lista (sem repetir) e retorna o primeiro que registrar, com `changed: true`; se nenhum registrar, retorna `{ shortcut: preferred, changed: false, failed: true }`.
- `isFirstRun(settingsFileExists)` → boolean (simples, mas testável).
Testes em `test/first-run.test.js`: preferido funciona; preferido falha e o 2º funciona; todos falham; preferido já está na lista (não tenta duas vezes).

## 4. Fluxo de primeira execução (`src/main.js`)
- Detectar primeira execução: o arquivo `settings.json` **não existe** ao iniciar.
- Na primeira execução:
  1. Registrar o atalho com `pickShortcut(settings.shortcut, tentativa)`, onde a tentativa usa `globalShortcut.register` e desfaz o registro das tentativas que falharem/forem descartadas (no fim, deixar registrado só o escolhido, via `applyShortcut`). Se mudou, salvar o atalho escolhido.
  2. Se `app.isPackaged`, ligar "Iniciar com o Windows" (`setLoginItemSettings({ openAtLogin: true })`) e salvar `launchAtLogin: true`.
  3. Salvar o `settings.json` (para não ser mais primeira execução).
  4. Abrir a janela de configurações em **modo boas-vindas** (ver item 5).
  5. Mostrar um balão na bandeja: título "GrokBot Assistant está pronto", texto "Use <atalho> para abrir o prompt. O ícone fica aqui na bandeja.".
- Fora da primeira execução, comportamento atual (sem fallback automático; o aviso de atalho ocupado continua).
- Para o modo boas-vindas, `openSettings({ welcome: true })` passa a informação pela query string ao carregar o HTML (`loadFile(..., { query: { welcome: '1' } })`).

## 5. Configurações em modo boas-vindas (`src/settings/*`)
- Se `new URLSearchParams(location.search).get('welcome') === '1'`: mostrar no topo (abaixo do cabeçalho) um cartão de destaque com:
  - título "Bem-vindo! 👋" (pode ser sem emoji se preferir manter o padrão) — texto: "Escolha para qual bot do Grok Bot suas mensagens vão. Depois é só apertar <atalho> em qualquer lugar." (mostrar o atalho atual com `<kbd>`).
  - Se a lista de bots carregar e o usuário ainda não tiver bot salvo, **pré-selecionar o primeiro bot da lista** (o mais usado), sem salvar — o usuário confirma em "Salvar".
  - Se não houver bots (Grok Bot não instalado/nunca aberto): texto do cartão "Não encontrei o Grok Bot neste computador. Instale e abra o Grok Bot, depois clique em Atualizar lista." e o link de download NÃO deve ser aberto automaticamente; mostrar só o texto.
- O botão "Salvar" no modo boas-vindas tem o texto "Salvar e começar" e, após salvar com sucesso, fecha a janela em ~800 ms.
- A janela continua cabendo sem rolagem na página (pode aumentar a altura da janela de configurações para no máximo 780 **somente** quando `welcome`; usar `setSize` no `main.js`, mantendo 720 no modo normal).
- Tudo com `textContent`/`createElement` (sem `innerHTML`), CSP inalterada.

## Critérios de aceite
- `npm test` passa; `node --check` em todos os `.js` alterados/criados.
- `package.json` válido (`node -e "require('./package.json')"`).
- NÃO rode `npm run dist` (o Claude Code gera e testa o instalador).

## O que NÃO fazer
- NÃO instalar dependências, NÃO rodar o app, NÃO gerar o instalador.
- NÃO alterar `src/lib/link.js`, `roster.js`, `settings.js`, `accelerator.js`, `avatar.js`, `position.js`, `src/prompt/*`, `assets/`, `scripts/`.
- NÃO fazer commit nem push. NÃO alterar `AGENTS.md` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa (inclua a linha "Dependência nova: electron-builder 26.18.1 — instalada pelo Claude Code para gerar o instalador NSIS").
