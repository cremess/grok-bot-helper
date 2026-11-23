# Tarefa 4 — Janela do prompt + atalho global

## Objetivo
Ao apertar o atalho global (lido das configurações; padrão `Alt+Space`), abrir uma caixa de texto flutuante. Ao enviar, abrir o link do Grok Bot gerado por `buildPromptLink` com o bot configurado e esconder a janela.

## Módulos já existentes (usar, NÃO alterar)
- `src/lib/link.js`: `buildPromptLink({ text, botId })`, `MAX_TEXT_LENGTH`.
- `src/lib/settings.js`: `loadSettings(filePath)`, `DEFAULT_SETTINGS`.
- `src/icon.js`: `createTrayIcon()`.

## Arquivos envolvidos
- Alterar: `src/main.js`
- Criar: `src/preload.js`, `src/prompt/prompt.html`, `src/prompt/prompt.css`, `src/prompt/prompt.js`, `src/lib/position.js`, `test/position.test.js`

## Especificação

### `src/lib/position.js` (puro, sem Electron)
- `promptPosition(workArea, size)` → `{ x, y }` inteiros: centralizado na horizontal dentro de `workArea` (`{x, y, width, height}`) e com o topo a 25% da altura da área (`y = workArea.y + Math.round(workArea.height * 0.25)`). Se a janela não couber, limitar para ficar dentro da área.
- Testes em `test/position.test.js`: monitor principal, monitor secundário com `x` e `y` negativos, área menor que a janela.

### `src/main.js`
- Manter: trava de instância única, bandeja com "Sair", `window-all-closed` sem encerrar.
- Carregar as configurações de `path.join(app.getPath('userData'), 'settings.json')` com `loadSettings` em `whenReady`.
- Criar UMA `BrowserWindow` de prompt, escondida no início:
  - `width: 640`, `height: 150`, `frame: false`, `resizable: false`, `movable: false`, `minimizable: false`, `maximizable: false`, `fullscreenable: false`, `skipTaskbar: true`, `alwaysOnTop: true`, `show: false`, `backgroundColor: '#1b1b1f'`.
  - `webPreferences`: `preload` = `src/preload.js`, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  - Bloquear navegação: `webContents.on('will-navigate', e => e.preventDefault())` e `setWindowOpenHandler(() => ({ action: 'deny' }))`.
  - Esconder a janela no evento `blur`.
- Função `togglePrompt()`:
  - se visível → esconde;
  - senão → posiciona com `promptPosition` no `workArea` do monitor onde está o cursor (`screen.getDisplayNearestPoint(screen.getCursorScreenPoint())`), mostra, dá foco e envia `prompt:show` ao renderer com `{ botId: settings.botId }`.
- Função `applyShortcut(accelerator)` → boolean:
  - desregistra o atalho anterior registrado por ela (se houver) e tenta registrar o novo com `globalShortcut.register(accelerator, togglePrompt)`;
  - se falhar (retorno `false` ou exceção), mostra `tray.displayBalloon({ title: 'GrokBot Assistant', content: 'Não foi possível registrar o atalho <atalho>. Ele pode estar em uso por outro programa.' })` e retorna `false`;
  - deixar a função pronta para ser reutilizada quando o usuário trocar o atalho (próxima tarefa).
- Chamar `applyShortcut(settings.shortcut)` após criar a bandeja e a janela.
- `second-instance` → mostra o prompt (se escondido).
- `will-quit` → `globalShortcut.unregisterAll()`.
- IPC (`ipcMain.handle`):
  - `prompt:submit` (texto) → `buildPromptLink({ text, botId: settings.botId })`; se `ok`, confirmar que a URL começa com `grokbot://app/v1/prompt?`, chamar `shell.openExternal(url)`, esconder a janela e retornar `{ ok: true }`; se não, retornar `{ ok: false, error }`. Se `openExternal` lançar erro, retornar `{ ok: false, error: 'open-failed' }`.
  - `prompt:hide` → esconde a janela.

### `src/preload.js`
- Usar `contextBridge.exposeInMainWorld('grokbot', { submit(text), hide(), onShow(callback) })`, chamando `ipcRenderer.invoke`/`ipcRenderer.on`. Não expor o `ipcRenderer` inteiro.

### `src/prompt/prompt.html` + `prompt.css` + `prompt.js`
- HTML com `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; script-src 'self'">`, `lang="pt-BR"`, sem scripts ou estilos inline.
- Layout: tema escuro, cantos arredondados, um `<textarea>` grande (placeholder: "Mensagem para o Grok Bot…"), uma linha de rodapé com o destino ("Destino: bot <id>" ou "Destino: bot padrão do Grok Bot" se `botId` vazio), o contador `n/1000` e uma área de erro.
- Teclas no textarea:
  - **Enter** (sem Shift, e com `event.isComposing === false`) → `submit`;
  - **Shift+Enter** → nova linha (comportamento padrão);
  - **Esc** → `hide`.
- Ao receber `onShow`: atualizar o rodapé, limpar o erro e focar o textarea (selecionando o texto que já estiver lá).
- Após envio com sucesso: limpar o textarea.
- Mensagens de erro em português: `empty` → "Digite uma mensagem.", `too-long` → "A mensagem passa de 1000 caracteres.", `invalid-bot-id` → "O bot configurado é inválido. Ajuste nas configurações.", `open-failed` → "Não foi possível abrir o Grok Bot.", outro → "Erro inesperado.".
- O contador fica com cor de alerta quando passa de 1000.

## Critérios de aceite
- `npm test` passa (antigos + novos).
- `node --check` passa em `src/main.js`, `src/preload.js`, `src/prompt/prompt.js` e `src/lib/position.js`.
- Segurança: `contextIsolation` ligado, `nodeIntegration` desligado, `sandbox` ligado, CSP sem `unsafe-inline`.
- Comentários curtos em português onde ajudar.

## O que NÃO fazer
- NÃO criar a tela de configurações nem mudar o menu da bandeja além do que já existe (próximas tarefas).
- NÃO alterar `src/lib/link.js`, `src/lib/settings.js`, `src/icon.js`, `package.json`.
- NÃO instalar dependências.
- NÃO rodar `npm start` nem abrir o app (o Claude Code testa a parte gráfica).
- NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa: arquivos alterados, resumo, testes executados e resultado, dúvidas ou bloqueios.
