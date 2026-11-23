# Tarefa 5 — Tela de configurações + menu da bandeja

## Objetivo
Permitir que o usuário escolha, sem editar arquivos:
1. o **bot de destino** (colando o link do bot ou o ID; vazio = bot padrão do Grok Bot);
2. o **atalho global** (gravado ao apertar as teclas);
3. **Iniciar com o Windows**.
As mudanças valem na hora, sem reiniciar. O menu da bandeja ganha "Abrir prompt" e "Configurações…".

## Módulos já existentes (usar; NÃO alterar, exceto `src/main.js`)
- `src/lib/link.js`: `parseBotId(input)`, `isValidBotId(id)`.
- `src/lib/settings.js`: `loadSettings`, `saveSettings`, `isValidShortcut`, `DEFAULT_SETTINGS`.
- `src/main.js`: já tem `togglePrompt()`, `applyShortcut(accelerator)` (retorna boolean e avisa na bandeja), a janela do prompt e os IPC `prompt:*`.

## Arquivos envolvidos
- Alterar: `src/main.js`
- Criar: `src/lib/accelerator.js`, `test/accelerator.test.js`, `src/settings-preload.js`, `src/settings/settings.html`, `src/settings/settings.css`, `src/settings/settings.js`

## Especificação

### `src/lib/accelerator.js` (puro, sem Electron, usado no Node E no navegador)
- Função `acceleratorFromKeyEvent({ code, ctrlKey, altKey, shiftKey, metaKey })` → string ou `null`.
  - Usa `code` (independe do layout do teclado): `KeyA`…`KeyZ` → `A`…`Z`; `Digit0`…`Digit9` → `0`…`9`; `F1`…`F24`; `Space`; `Tab`; `Enter`; `Backspace`; `Delete`; `Insert`; `Home`; `End`; `PageUp`; `PageDown`; `ArrowUp/Down/Left/Right` → `Up/Down/Left/Right`; `Backquote` → `` ` ``, `Minus` → `-`, `Equal` → `=`, `BracketLeft` → `[`, `BracketRight` → `]`, `Backslash` → `\`, `Semicolon` → `;`, `Quote` → `'`, `Comma` → `,`, `Period` → `.`, `Slash` → `/`.
  - Ordem dos modificadores: `Ctrl`, `Alt`, `Shift`, `Super` (`metaKey` = `Super`).
  - Retorna `null` se não houver modificador, se a tecla for só modificador (`ControlLeft`, `AltRight`, `ShiftLeft`, `MetaLeft` etc.) ou se o `code` não estiver no mapa.
- Exportação compatível com os dois ambientes, sem bundler:
  ```js
  if (typeof module !== 'undefined' && module.exports) module.exports = { acceleratorFromKeyEvent };
  else globalThis.acceleratorFromKeyEvent = acceleratorFromKeyEvent;
  ```
- Testes em `test/accelerator.test.js`: Alt+Space, Ctrl+Shift+G, Super+Shift+F12, Ctrl+Alt+ArrowUp → `Ctrl+Alt+Up`, Ctrl+Slash, sem modificador → null, só modificador → null, code desconhecido → null. Conferir que TODO resultado não nulo passa em `isValidShortcut` (de `src/lib/settings.js`).

### `src/main.js`
- Guardar o caminho do arquivo de configurações numa constante de módulo (definida em `whenReady`).
- **Menu da bandeja** (substituir o atual): `Abrir prompt` (chama `togglePrompt` se a janela estiver escondida) · `Configurações…` (abre a janela de configurações) · separador · `Sair`. Clique esquerdo no ícone (`tray.on('click')`) também abre o prompt.
- **Janela de configurações** `openSettings()`:
  - Se já existir e não estiver destruída → `show()` + `focus()`. Senão cria uma `BrowserWindow`: `width: 480`, `height: 440`, `resizable: false`, `minimizable: false`, `maximizable: false`, `fullscreenable: false`, `autoHideMenuBar: true`, `title: 'GrokBot Assistant — Configurações'`, `backgroundColor: '#1b1b1f'`, com `webPreferences` iguais às do prompt (preload = `src/settings-preload.js`, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`), navegação bloqueada (`will-navigate` + `setWindowOpenHandler` negando) e `Menu` removido (`setMenu(null)`).
  - Ao fechar, zera a variável da janela e garante que o atalho global volte a ficar registrado (caso a gravação tenha sido interrompida).
- **IPC** (`ipcMain.handle`):
  - `settings:get` → `{ botId, shortcut, launchAtLogin, defaultShortcut: DEFAULT_SETTINGS.shortcut }`.
  - `settings:recording` (`boolean`) → se `true`, desregistra o atalho global atual (para a gravação não abrir o prompt); se `false`, registra de novo o atalho salvo (`applyShortcut(settings.shortcut)`).
  - `settings:save` (`{ botInput, shortcut, launchAtLogin }`) → retorna `{ ok: true, settings }` ou `{ ok: false, error }`:
    1. `botInput` com `trim()`; vazio → `botId = ''`; senão `parseBotId(botInput)`; se `null` → `{ ok: false, error: 'invalid-bot' }`.
    2. `isValidShortcut(shortcut)` falso → `{ ok: false, error: 'invalid-shortcut' }`.
    3. Se o atalho mudou: `applyShortcut(shortcut)`; se falhar, chamar `applyShortcut(<atalho antigo>)` para restaurar e retornar `{ ok: false, error: 'shortcut-taken' }`.
    4. `app.setLoginItemSettings` com `openAtLogin: Boolean(launchAtLogin)`. Quando `!app.isPackaged`, passar também `path: process.execPath` e `args: [app.getAppPath()]` (no modo de desenvolvimento o Electron precisa saber qual app abrir).
    5. `saveSettings(caminho, novo)`, atualizar a variável `settings` em memória com o retorno e devolver `{ ok: true, settings }`.
  - Ajustar `applyShortcut` só se for necessário para este fluxo (por exemplo, para não mostrar o balão de erro durante a restauração). Manter a assinatura.

### `src/settings-preload.js`
- `contextBridge.exposeInMainWorld('grokbotSettings', { get(), save(payload), setRecording(isRecording) })` usando `ipcRenderer.invoke`. Não expor o `ipcRenderer`.

### `src/settings/settings.html` + `.css` + `.js`
- CSP igual à do prompt (`default-src 'self'; style-src 'self'; script-src 'self'`), `lang="pt-BR"`, sem inline. Carregar `../lib/accelerator.js` ANTES de `settings.js` com `<script src>`.
- Tema escuro coerente com o prompt. Campos:
  1. **Bot de destino**: `<input>` com placeholder "Cole o link do bot ou o ID (vazio = bot padrão)". Abaixo, um texto de ajuda que mostra em tempo real "ID reconhecido: <id>" quando o valor for um ID puro válido (regex `^[A-Za-z0-9_-]{1,128}$`) e "Será validado ao salvar" quando for um link; vazio → "Usará o bot padrão do Grok Bot". (A validação definitiva é a do processo principal.)
  2. **Atalho**: um `<input readonly>` que mostra o atalho atual. Ao receber foco: chama `setRecording(true)` e mostra "Pressione a combinação…". No `keydown`: `preventDefault()`, monta com `acceleratorFromKeyEvent`; se não for `null`, mostra o novo atalho e sai do modo de gravação (`blur`). `Esc` cancela a gravação e restaura o valor anterior. No `blur`: `setRecording(false)`. Botão "Restaurar padrão" coloca `defaultShortcut`.
  3. **Iniciar com o Windows**: checkbox.
  - Botões **Salvar** e **Fechar** (`window.close()`).
  - Mensagens em português: `invalid-bot` → "Link ou ID do bot inválido.", `invalid-shortcut` → "Atalho inválido.", `shortcut-taken` → "Esse atalho já está em uso por outro programa.", outro → "Erro inesperado.". Sucesso → "Configurações salvas." (e o campo do bot passa a mostrar o ID salvo).

## Critérios de aceite
- `npm test` passa (antigos + novos).
- `node --check` passa em todos os `.js` criados/alterados.
- Mesmo nível de segurança das janelas existentes (isolamento, sandbox, CSP sem `unsafe-inline`, navegação bloqueada).
- O prompt continua funcionando como antes (Enter envia, Esc fecha, destino mostrado).

## O que NÃO fazer
- NÃO alterar `src/lib/link.js`, `src/lib/settings.js`, `src/lib/position.js`, `src/icon.js`, arquivos de `src/prompt/` nem `package.json`.
- NÃO instalar dependências.
- NÃO rodar `npm start` nem abrir o app (o Claude Code testa a parte gráfica).
- NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa: arquivos alterados, resumo, testes executados e resultado, dúvidas ou bloqueios.
