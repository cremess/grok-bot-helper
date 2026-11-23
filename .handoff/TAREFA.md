# Tarefa 14 — Novas opções: trocar de bot no prompt, copiar/abrir resposta, histórico, notificação e tema

## Objetivo
Deixar o app mais prático no dia a dia. Leia antes: `src/main.js`, `src/preload.js`, `src/settings-preload.js`, `src/prompt/*`, `src/settings/*`, `src/lib/settings.js`, `src/lib/roster.js`, `src/lib/avatar.js`, `src/ui/tokens.css`.

## Arquivos envolvidos
- Alterar: `src/main.js`, `src/preload.js`, `src/settings-preload.js`, `src/prompt/*`, `src/settings/*`, `src/lib/settings.js` + `test/settings.test.js`
- Criar: `src/lib/history.js`, `test/history.test.js`

## 1. Trocar de bot direto no prompt
- A pílula "Para <bot>" vira um **botão** (`aria-haspopup="listbox"`). Clique ou `Ctrl+K` abre um **menu suspenso** logo abaixo dela, dentro do cartão, com: os bots de `listBots` (avatar + nome, o atual com ✓) e no fim "Bot padrão do Grok Bot". Navegação por setas, `Enter` escolhe, `Esc` fecha só o menu (não o prompt), clique fora fecha o menu.
- Escolher um bot **salva** como destino (mesmo efeito de salvar nas configurações: `botId`, `botName`), atualiza a pílula e recarrega a área de resposta com a conversa desse bot. Se houver espera pendente, ela é encerrada (mesma regra de trocar o bot nas configurações).
- Novo IPC `prompt:bots` (lista com avatar, igual a `settings:bots`) e `prompt:select-bot` (`{ botId, botName }`, validar com `isValidBotId` ou vazio para padrão; resposta `{ ok, conversation, bot: { botId, botName, botColor, botInitial } }`).
- O cartão cresce para caber o menu (pedir `prompt:resize`); o menu rola se tiver muitos bots (máx. ~240 px).

## 2. Ações na resposta
- Na linha de título da área de resposta, à direita (antes de "Conversa"), dois botões só com ícone SVG inline (16 px, `currentColor`, com `aria-label` e `title`):
  - **Copiar** (`title="Copiar resposta"`): copia o texto da última resposta (markdown original) via IPC `prompt:copy` → `clipboard.writeText` no main (limitar a 20.000 caracteres). Feedback: o ícone vira ✓ por ~1,2 s.
  - **Abrir no Grok Bot** (`title="Abrir conversa no Grok Bot"`): IPC `prompt:open-bot` → `shell.openExternal('grokbot://app/v1/agent?id=<agentId>')` usando o `agentId` resolvido da conversa (validar com `isValidBotId`); sem id → `grokbot://app/v1/open`. Depois esconde o prompt.
- "Ver mais"/degradê **só aparecem se o conteúdo realmente passar** da altura recolhida (medir `scrollHeight > clientHeight` após renderizar; reavaliar ao redimensionar/trocar de resposta).

## 3. Histórico de envios (`src/lib/history.js`, puro + `node:fs`)
- `loadHistory(file)` → array de strings (até 50; arquivo ausente/corrompido → `[]`, nunca lança).
- `addToHistory(list, text, max = 50)` → nova lista com `text` (trim) no fim, removendo duplicata anterior idêntica; ignora vazio.
- `saveHistory(file, list)` → escrita atômica (`.tmp` + `rename`), cria a pasta.
- Testes em `test/history.test.js` (pasta temporária).
- No main: arquivo `path.join(app.getPath('userData'), 'history.json')`; ao enviar com sucesso, adicionar e salvar. Enviar a lista no `prompt:show` (`history`).
- No prompt: com o campo **vazio** (ou navegando no histórico e sem edição), `↑` mostra o envio anterior e `↓` o seguinte (no fim, volta ao campo vazio). Digitar algo sai do modo histórico. Cursor no fim do texto.
- Nas configurações (cartão Geral): botão de texto "Limpar histórico de envios" → IPC `settings:clear-history` (esvazia e salva), com confirmação inline ("Limpar? Sim / Não") — sem `confirm()` nativo.

## 4. Notificação do Windows (opcional, padrão desligado)
- `src/lib/settings.js`: novo campo `notifyOnReply: false` (boolean).
- No main, quando uma resposta chega e o prompt **não está visível**: se `notifyOnReply` e `Notification.isSupported()`, mostrar `new Notification({ title: <bot>, body: <primeiros 140 caracteres do texto sem marcação markdown simples **, *, `, #>, silent: false, icon: appIconPath() })`. Clique na notificação → abre o prompt (e limpa o não lido). O ponto na bandeja continua acontecendo independentemente da notificação.
- Configurações (Geral): interruptor "Notificar quando a resposta chegar" com ajuda "Mostra uma notificação do Windows se o prompt estiver fechado."

## 5. Tema
- `src/lib/settings.js`: novo campo `theme: 'system'` com valores `'system' | 'dark' | 'light'`.
- No main: aplicar com `nativeTheme.themeSource = settings.theme` ao iniciar e ao salvar (isso já faz o `prefers-color-scheme` das páginas seguir a escolha). Atualizar o `backgroundColor` da janela de configurações conforme o tema efetivo.
- Configurações (Geral): controle segmentado "Tema": Sistema · Escuro · Claro.

## 6. Configurações — layout
- Organizar o cartão Geral em linhas consistentes (rótulo + ajuda à esquerda, controle à direita), na ordem: Iniciar com o Windows · Notificar quando a resposta chegar · Depois de enviar · Tema · Limpar histórico.
- Se não couber, pode aumentar a altura da janela até 860 (normal) / 900 (boas-vindas); se ainda assim não couber, a **área do meio** rola (cabeçalho e rodapé fixos, barra de rolagem fina já existente). Nada de rolagem dupla na lista de bots + página ao mesmo tempo sem necessidade.
- `settings:get`/`settings:save` passam a incluir `notifyOnReply` e `theme` (validar: boolean e um dos três valores; inválido → erro `invalid-option`).

## Critérios de aceite
- `npm test` passa (antigos + novos); `node --check` em todos os `.js` alterados/criados.
- Segurança mantida: CSP inalterada, sem `innerHTML`, links/deep links só montados no main com IDs validados, clipboard só no main.
- Acessibilidade: menus e botões navegáveis por teclado, `aria-*` coerentes.
- Tudo em português do Brasil.

## O que NÃO fazer
- NÃO alterar `src/lib/transcript.js`, `markdown.js`, `roster.js`, `link.js`, `accelerator.js`, `avatar.js`, `first-run.js`, `relative-time.js`, `assets/`, `scripts/`, `package.json`.
- NÃO rodar o app nem gerar instalador/ícones. NÃO instalar dependências.
- NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa.
