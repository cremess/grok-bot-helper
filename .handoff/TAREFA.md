# Tarefa 17 — Bug: prompt trava em "<bot> está respondendo…" quando o Grok Bot recusa o envio

## Diagnóstico (feito pelo Claude Code)
O usuário estava sem cota no Grok Bot. Nesse caso o Grok Bot **recusa o envio e não grava nada na conversa**; o app ficava esperando até o tempo limite de 10 min. O Grok Bot guarda o estado de uso localmente, na mesma pasta lida por `roster.js`/`transcript.js`, no arquivo cuja chave decodificada casa com `/^sand\.client\.slice\.account\..+\.weekly-usage\.cache$/`:
```json
{ "schemaVersion": 3, "value": { "kind": "present", "reading": {
  "usage": { "percentUsed": 100, "nextResetMs": 1795605951834, "wouldRefuseSend": true,
             "grokPlanLabel": "Grok Bot Plan", "prepaidBalanceCents": 0, "onDemand": null },
  "readAtMs": 1795449257350 }, "expiresAtMs": 1795535658303 } }
```
Outros motivos para a mensagem não chegar: o usuário clicou **Cancelar** na confirmação do Grok Bot, ou o Grok Bot estava fechado/travado.

## Arquivos envolvidos
- Criar: `src/lib/usage.js`, `test/usage.test.js`
- Alterar: `src/lib/transcript.js` + `test/transcript.test.js` (só a função nova do item 2), `src/main.js`, `src/preload.js`, `src/prompt/prompt.html|css|js`

## 1. `src/lib/usage.js` (CommonJS, sem Electron)
- `readUsage(dir)` → `{ ok: true, percentUsed, wouldRefuseSend, nextResetMs, readAtMs, planLabel }` ou `{ ok: false, error: 'not-found' | 'unreadable' }`. Usa `findPersistenceFile` de `roster.js`. Campos ausentes/tipos errados → `percentUsed: null`, `wouldRefuseSend: false`, `nextResetMs: null`. Nunca lança.
- `isBlocked(usage, nowMs)` → `true` somente se `usage.ok && usage.wouldRefuseSend === true` e (`nextResetMs` nulo **ou** `nextResetMs > nowMs`).
- `formatReset(nextResetMs, nowMs)` → texto pt-BR curto: "hoje às 08:25", "amanhã às 08:25" ou "qua., 25/11 às 08:25" (use `Intl.DateTimeFormat('pt-BR')`, fuso local); `null` → "em breve".
- Testes em `test/usage.test.js` (pasta temporária + `encodeBase32`): arquivo ausente, JSON quebrado, bloqueado, não bloqueado, renovação já passou (não bloqueia), formatos de `formatReset` com datas fixas.

## 2. `src/lib/transcript.js`
- Nova função `userMessageSince(entries, afterMs)` → `true` se existir entrada `role: 'user'` com `timestampMs >= afterMs`. Teste correspondente.

## 3. `src/main.js`
- **Antes de enviar** (`prompt:submit`): ler `readUsage`. Se `isBlocked`, **não abrir o link** e retornar `{ ok: false, error: 'limit', resetText: formatReset(...), percentUsed }` — **a menos que** o renderer mande `{ text, force: true }` (o `prompt:submit` passa a aceitar string OU `{ text, force }`; manter compatibilidade com string).
- **No `prompt:show`** incluir `usage: { blocked, percentUsed, resetText }` (para o prompt mostrar aviso/indicador).
- **Espera** (poll existente): além de procurar a resposta, verificar se a mensagem chegou ao Grok Bot com `userMessageSince(entries, pending.sentAt - 2000)`.
  - Se **45 s** depois do envio a mensagem ainda não apareceu na conversa, encerrar a espera e enviar `prompt:conversation` com `{ ...conversa, waiting: false, notDelivered: true, usage: {...} }` (reler o uso nesse momento).
  - Se a mensagem apareceu, continuar esperando a resposta (até os 10 min atuais).
- Novo IPC `prompt:stop-waiting` → encerra a espera (mesma função `stopWaiting`) e devolve a conversa atual (`waiting: false`).
- No modo `'hide'`, se der `notDelivered` com o prompt escondido: tooltip da bandeja "GrokBot Assistant — A mensagem não chegou ao Grok Bot" e o ícone de não lido (o usuário abre e vê o motivo).

## 4. Prompt (interface)
- **Aviso de limite** (quando `usage.blocked`): faixa discreta no topo da área de conteúdo, cor de alerta suave (`color-mix(in srgb, var(--error) 14%, var(--surface))`, texto `var(--text)`): "Seu limite do Grok Bot acabou. Renova {resetText}." O campo continua editável.
- Ao tentar enviar e receber `error: 'limit'`: mostrar na linha de erro "O Grok Bot está sem limite agora (renova {resetText})." e um botão de texto **"Enviar mesmo assim"**, que reenvia com `force: true`.
- **Indicador de uso**: se `percentUsed >= 80` e não bloqueado, no rodapé à direita (antes do "Enviar") um texto pequeno secundário "Uso: {percentUsed}%".
- **Enquanto espera**: ao lado de "<bot> está respondendo…", um botão de texto pequeno **"Parar"** (chama `stopWaiting()` do preload). Após 15 s de espera sem a mensagem aparecer, trocar o texto de status para "Aguardando o Grok Bot receber a mensagem… Confirme no Grok Bot se ele pedir."
- **`notDelivered`**: mostrar a bolha da mensagem enviada com um indicador de falha (ícone ⚠ pequeno) e abaixo: "A mensagem não chegou ao Grok Bot." + motivo provável: se `usage.blocked` → "Seu limite acabou (renova {resetText})."; senão → "Talvez a confirmação tenha sido cancelada ou o Grok Bot esteja fechado." + botão de texto **"Tentar de novo"** que reenvia o mesmo texto (com `force: true` se o motivo foi limite e o usuário clicou).
- `preload.js`: expor `stopWaiting()`; `submit(text, options)` passa a enviar `{ text, force }` quando houver opções.
- Tudo com `textContent`/`createElement`; CSP inalterada.

## Critérios de aceite
- `npm test` e `npm run check` passam (antigos + novos).
- Cenário do bug: com `wouldRefuseSend: true` o envio **não fica preso**; o usuário vê o motivo na hora (antes de enviar) e, se forçar, em no máximo ~45 s vê "não chegou".
- Um único `setInterval` de espera por vez; sempre limpo.

## O que NÃO fazer
- NÃO alterar `roster.js` (só usar), `markdown.js`, `link.js`, `settings.js`, `bot-picker`, `src/settings/*`, `assets/`, `scripts/`, `package.json`.
- NÃO rodar o app. NÃO instalar dependências. NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa.
