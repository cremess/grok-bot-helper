# Tarefa 13 — Painel de resposta no prompt, modos "Depois de enviar" e aviso na bandeja

## Objetivo
"Notch sob demanda": ao abrir o prompt, o usuário vê a **última resposta do bot** (e pode expandir para a conversa recente). Depois de enviar, o comportamento segue a opção `afterSend` (já existe em `src/lib/settings.js`):
- `'wait'` (padrão) — o prompt fica aberto, mostra "<bot> está respondendo…" e exibe a resposta quando ela chegar.
- `'hide'` — o prompt fecha; quando a resposta chegar, o ícone da bandeja ganha um pontinho e o tooltip vira "Nova resposta de <bot>"; ao abrir o prompt, a resposta está lá e o pontinho some.

Leia antes: `src/main.js`, `src/preload.js`, `src/settings-preload.js`, `src/prompt/*`, `src/settings/*`, `src/lib/transcript.js`, `src/lib/markdown.js`, `src/lib/settings.js`, `src/icon.js`, `scripts/build-icons.js`, `assets/tray.svg`.

## Arquivos envolvidos
- Alterar: `src/main.js`, `src/preload.js`, `src/settings-preload.js`, `src/prompt/prompt.html|css|js`, `src/settings/settings.html|css|js`, `src/icon.js`, `scripts/build-icons.js`
- Criar: `assets/tray-unread.svg`, `src/lib/relative-time.js`, `test/relative-time.test.js`

## 1. `src/lib/relative-time.js` (puro, exportação dupla como `accelerator.js`)
- `relativeTime(timestampMs, nowMs)` em pt-BR: `< 60 s` → "agora"; `< 60 min` → "há N min"; mesmo dia → "há N h"; dia anterior → "ontem, HH:MM"; mais antigo → "DD/MM, HH:MM". Testes cobrindo cada faixa (usar datas fixas; fuso local).

## 2. Ícone de "não lido"
- `assets/tray-unread.svg`: cópia de `assets/tray.svg` com um ponto de destaque no canto superior direito (círculo ~9/32 do tamanho, cor `#ff5a5f`, contorno de 2 px na cor de fundo escura `#1b1b1f` para separar do ícone).
- `scripts/build-icons.js`: gerar também `assets/icons/tray-unread.png` (16) e `assets/icons/tray-unread@2x.png` (32). NÃO rodar o script (o Claude Code roda).
- `src/icon.js`: exportar `createTrayIcon({ unread = false } = {})` que carrega `tray-unread.png` quando `unread` (com o mesmo fallback atual se vier vazio). Chamadas existentes sem argumento continuam funcionando.

## 3. `src/main.js`
### Conversa
- Constante da pasta do Grok Bot já existe (reutilizar). Função `loadConversation()` → usa `readConversation(dir, settings.botId)`; retorna `{ ok, entries: recentExchanges(entries, 6), latest: latestReply(entries) }` ou `{ ok: false }`.
- `prompt:show` passa a incluir `conversation: loadConversation()` e `waiting` (boolean, ver abaixo) e `botName` já existente.
- Novo IPC `prompt:open-link` (string) → só abre se `new URL(url).protocol` for `http:` ou `https:` (`shell.openExternal`); senão ignora.

### Espera pela resposta (os dois modos)
- Ao enviar com sucesso, guardar `pending = { sentAt: Date.now(), botId: settings.botId, mode: settings.afterSend }` e iniciar um **poll** a cada 1000 ms (um único `setInterval`; nunca dois ao mesmo tempo) que chama `readConversation` e procura `latestReply(entries, { afterMs: pending.sentAt - 2000 })`.
- Encerrar a espera quando: achar resposta, passar 10 minutos, ou o usuário trocar de bot nas configurações. Ao expirar, enviar ao prompt `prompt:conversation` com `{ ...conversa, waiting: false, timedOut: true }`.
- **Modo `'wait'`**:
  - Não esconder o prompt depois do envio (remover o `setTimeout` de 280 ms nesse modo) e enviar `prompt:conversation` com `{ ...conversa, waiting: true }`.
  - Enquanto espera: `promptWindow.setAlwaysOnTop(false)` (para a janela de confirmação do Grok Bot poder ficar por cima) e **não esconder no `blur`**.
  - Ao chegar a resposta: `setAlwaysOnTop(true)`, enviar `prompt:conversation` com `{ ...conversa, waiting: false }`; se a janela não estiver visível, `showInactive()` (não roubar o foco); a partir daí o `blur` volta a esconder normalmente.
  - `Esc`/esconder durante a espera NÃO cancela a espera: a resposta, quando chegar, liga o ponto de não lido (como no modo `'hide'`) se o prompt estiver escondido nessa hora.
- **Modo `'hide'`**: manter o comportamento atual de esconder após ~280 ms. Ao chegar a resposta com o prompt escondido: `tray.setImage(createTrayIcon({ unread: true }))` e `tray.setToolTip('GrokBot Assistant — Nova resposta de <bot>')`.
- Ao abrir o prompt (`togglePrompt`/abrir pelo menu): limpar o não lido (`tray.setImage(createTrayIcon())`, tooltip normal).
- Clique esquerdo no ícone da bandeja continua abrindo o prompt.
- `prompt:resize`: aumentar o limite máximo de altura para 600 px.

### Configurações
- `settings:get` inclui `afterSend`. `settings:save` aceita `afterSend` (`'wait'`/`'hide'`; outro valor → `invalid-after-send`) e salva junto. Se o `botId` mudar, encerrar a espera pendente e limpar o não lido.

## 4. Prompt — interface
- Carregar `../lib/markdown.js` e `../lib/relative-time.js` com `<script src>` antes de `prompt.js`.
- **Área de resposta** entre o cabeçalho e o campo de texto (só aparece se `conversation.ok` e houver `latest`):
  - Linha de título discreta: avatar pequeno (18 px) + "**<bot>** · <tempo relativo>".
  - Corpo: o markdown renderizado com `createElement`/`textContent` a partir da árvore de `parseMarkdown` (parágrafos, títulos, listas, citações, blocos de código com fundo `var(--surface)` e fonte monoespaçada `Cascadia Mono, Consolas, monospace`, código inline, negrito, itálico; links como `<a>` que ao clicar chamam `openLink(href)` com `preventDefault`).
  - **Recolhido** por padrão: altura máxima ~5 linhas com degradê no fim e botão de texto "Ver mais"; expandido: até ~320 px com rolagem interna (mesma barra de rolagem fina das configurações) e "Ver menos".
  - Botão de texto "Conversa" (à direita do título) alterna para a visão das **últimas 6 mensagens** em bolhas: usuário à direita (fundo `color-mix(in srgb, var(--accent) 22%, var(--surface))`), bot à esquerda (`var(--surface)`), cada uma com markdown e tempo relativo pequeno. "Conversa" ↔ "Última resposta".
  - Se `waiting`: mostrar a mensagem enviada como bolha do usuário e, abaixo, "<bot> está respondendo…" com três pontinhos animados (respeitar `prefers-reduced-motion`). Se `timedOut`: "A resposta está demorando. Confira no Grok Bot." em cor secundária.
  - Quando chegar a resposta com a janela visível: animação sutil de entrada (fade + 4 px).
- O campo e o rodapé continuam como estão; o envio limpa o campo e mantém o foco no campo no modo `'wait'`.
- Pedir `prompt:resize` sempre que a altura do cartão mudar (troca de visão, expandir, nova resposta).
- Atualizar o tempo relativo a cada 30 s enquanto visível.
- `preload.js`: expor `onConversation(callback)` e `openLink(url)`.
- Tudo com `textContent`/`createElement` (sem `innerHTML`); CSP inalterada.

## 5. Configurações — interface
- No cartão **Geral**, abaixo do "Iniciar com o Windows", um grupo "Depois de enviar" com controle segmentado acessível (dois `<input type="radio">` estilizados lado a lado):
  - "Esperar a resposta" — ajuda: "O prompt fica aberto e mostra a resposta quando chegar."
  - "Fechar e avisar" — ajuda: "O prompt fecha e o ícone da bandeja ganha um ponto quando a resposta chegar."
  (mostrar só a ajuda da opção selecionada).
- Salvar envia `afterSend`. A janela continua sem rolagem na página (pode subir a altura normal para até 780 e a de boas-vindas para até 840 no `main.js`, só se necessário).

## Critérios de aceite
- `npm test` passa (antigos + novos); `node --check` em todos os `.js` alterados/criados.
- Um único `setInterval` de espera ativo por vez; sempre limpo ao terminar.
- Segurança mantida (CSP, isolamento, sem `innerHTML`, links só http/https via main).

## O que NÃO fazer
- NÃO alterar `src/lib/transcript.js`, `markdown.js`, `roster.js`, `settings.js`, `link.js`, `accelerator.js`, `avatar.js`, `first-run.js`, `package.json`.
- NÃO rodar o app, o gerador de ícones nem o `dist`. NÃO instalar dependências.
- NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa.
