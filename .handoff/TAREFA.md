# Tarefa 12 — Ler a conversa do Grok Bot, formatar o texto e a opção "Depois de enviar" (lógica pura, com testes)

## Contexto
Queremos mostrar no prompt a **última resposta do bot** (e as trocas recentes). O Grok Bot guarda as conversas na mesma pasta já usada pelo `src/lib/roster.js` (`%APPDATA%\Grok Bot\sand-client-persistence`), em arquivos `<chave base32>.blob`:
- Conversa de um bot: chave decodificada casa com `/^sand\.client\.slice\.account\..+\.transcript\.replicas\.<ID DO BOT>$/`.
- Bot "padrão" (quando o usuário não escolheu bot): o ID está no arquivo cuja chave casa com `/^sand\.client\.slice\.account\..+\.selection\.last-agent$/`, conteúdo `{ "schemaVersion": 1, "value": { "agentId": "<id>" } }`.
- Conteúdo de uma conversa (JSON UTF-8):
  ```json
  { "schemaVersion": 1, "value": { "entries": [
    { "kind": "message", "id": "t104u", "role": "user", "content": "texto do usuário", "timestampMs": 1795096503377, "seq": 465 },
    { "kind": "message", "id": "t105a", "role": "assistant", "content": "", "isStreaming": false, "timestampMs": 1795096503999, "seq": 466 },
    { "kind": "send-message", "id": "t164s681", "message": { "type": "text", "content": "resposta visível do bot em **markdown**" }, "timestampMs": 1795384795161, "seq": 681 },
    { "kind": "send-message", "message": { "type": "widget", "content": {} }, "timestampMs": 1, "seq": 1 },
    { "kind": "send-message", "message": { "type": "attachment", "content": {} }, "timestampMs": 1, "seq": 1 },
    { "kind": "user-attachment", "file_name": "image.png", "timestampMs": 1, "seq": 1 },
    { "kind": "event", "event": {}, "timestampMs": 1, "seq": 1 }
  ] } }
  ```
  - **Resposta visível do bot** = `kind: "send-message"` com `message.type === "text"` e `message.content` string não vazia.
  - **Mensagem do usuário** = `kind: "message"`, `role: "user"`, `content` string não vazia.
  - Todo o resto é ignorado (inclusive `role: "assistant"`, widgets, anexos, eventos).

## Arquivos envolvidos
- Criar: `src/lib/transcript.js`, `test/transcript.test.js`, `src/lib/markdown.js`, `test/markdown.test.js`
- Alterar: `src/lib/roster.js` (só exportar uma função auxiliar, ver abaixo), `src/lib/settings.js` + `test/settings.test.js` (campo novo)

## 1. `src/lib/roster.js`
- Extrair e exportar `findPersistenceFile(dir, keyRegex)` → caminho do `.blob` mais recente cuja chave decodificada casa com `keyRegex`, ou `null` (nunca lança). `findRosterFile` passa a usar essa função. Comportamento atual inalterado (todos os testes antigos continuam passando).

## 2. `src/lib/transcript.js` (CommonJS, sem Electron)
Exportar:
- `escapeRegex(text)` (auxiliar).
- `resolveAgentId(dir, botId)` → `botId` se não vazio; senão lê o `last-agent` e retorna o `agentId` válido (`isValidBotId`) ou `null`.
- `findTranscriptFile(dir, agentId)` → caminho ou `null` (usa `findPersistenceFile` com o regex acima, escapando o ID).
- `parseTranscript(json)` → array de `{ id, role: 'bot' | 'user', text, timestampMs }` em ordem crescente de `seq` (desempate por `timestampMs`); entradas inválidas são ignoradas; JSON inválido → `[]`; nunca lança. `text` com `trim()`. `timestampMs` numérico (ausente → 0).
- `readConversation(dir, botId)` → `{ ok: true, agentId, entries, mtimeMs }` ou `{ ok: false, error: 'no-agent' | 'not-found' | 'unreadable' }`.
- `latestReply(entries, { afterMs } = {})` → a última entrada `role: 'bot'` com `timestampMs > afterMs` (se `afterMs` informado), ou `null`.
- `recentExchanges(entries, limit = 6)` → as últimas `limit` entradas (usuário e bot), em ordem cronológica.

## 3. `src/lib/markdown.js` (puro; funciona no Node e no navegador, mesma exportação dupla de `src/lib/accelerator.js`)
Um parser **pequeno e seguro** que transforma markdown em uma árvore de nós simples (NUNCA HTML em string). Exportar `parseMarkdown(text)` → array de blocos:
- `{ type: 'paragraph', children: Inline[] }` (linhas consecutivas viram um parágrafo; quebra simples de linha vira `{ type: 'break' }`).
- `{ type: 'heading', level: 1..3, children }` para `#`, `##`, `###`.
- `{ type: 'list', ordered: boolean, items: Inline[][] }` para `- `, `* `, `1. ` (um nível; itens consecutivos).
- `{ type: 'code', text }` para blocos cercados por ```` ``` ```` (linguagem ignorada).
- `{ type: 'quote', children }` para linhas começando com `> `.
- Inline: `{ type: 'text', text }`, `{ type: 'strong', children }` (`**x**`), `{ type: 'em', children }` (`*x*` ou `_x_`), `{ type: 'code', text }` (`` `x` ``), `{ type: 'link', text, href }` para `[texto](https://...)` — aceitar SOMENTE `http:`/`https:`; outros esquemas viram texto puro.
- Tolerante: marcação não fechada vira texto literal; nunca lança.
- Testes em `test/markdown.test.js` cobrindo cada tipo, aninhamento simples (negrito com código dentro), link `javascript:` virando texto, bloco de código não fechado, texto vazio → `[]`.

## 4. `src/lib/settings.js`
- Novo campo `afterSend: 'wait'` em `DEFAULT_SETTINGS`; valores aceitos `'wait'` e `'hide'`; outro valor → padrão. Atualizar testes.

## 5. Testes `test/transcript.test.js`
Pasta temporária com arquivos `.blob` gerados com `encodeBase32` (de `roster.js`): achar a conversa do bot certo entre várias; `last-agent` quando `botId` vazio; ausência de arquivo; JSON quebrado; filtragem e ordenação; `latestReply` com e sem `afterMs`; `recentExchanges` com limite.

## Critérios de aceite
- `npm test` passa (antigos + novos). Sem dependências externas.

## O que NÃO fazer
- NÃO alterar `src/main.js`, janelas, preloads, `package.json` (a interface vem na próxima tarefa).
- NÃO ler a pasta real do Grok Bot nos testes.
- NÃO instalar dependências. NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa.
