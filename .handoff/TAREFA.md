# Tarefa 7 — Ler a lista de bots do Grok Bot + guardar o nome do bot

## Contexto
O usuário não quer digitar o ID do bot. O Grok Bot (app desktop) guarda a lista de bots do usuário localmente:
- Pasta: `%APPDATA%\Grok Bot\sand-client-persistence\` (em Node: `path.join(app.getPath('appData'), 'Grok Bot', 'sand-client-persistence')`; o módulo recebe o caminho por parâmetro).
- Cada arquivo se chama `<chave codificada em base32>.blob`. A codificação é base32 RFC 4648, **alfabeto minúsculo** `abcdefghijklmnopqrstuvwxyz234567`, **sem padding** `=`.
- O arquivo da lista é aquele cuja chave decodificada casa com `/^sand\.client\.slice\.account\..+\.roster\.last-roster$/` (exemplo de chave: `sand.client.slice.account.grok%7Cuser_01ABC.roster.last-roster`).
- Conteúdo (JSON UTF-8):
  ```json
  { "schemaVersion": 4, "value": { "rows": [
    { "id": "1f0c9a2e-5b7d-4c3a-9e8f-2a6b4d0c7e15", "name": "Grok", "avatarColor": "black",
      "isGroup": false, "isHiddenFromSidebar": false, "isRemovedFromSidebar": false,
      "lastActivityAt": 1795384795161, "...": "outros campos que devem ser ignorados" }
  ] } }
  ```
- O ID do bot (UUID com hífens) passa em `isValidBotId` de `src/lib/link.js`.

## Arquivos envolvidos
- Criar: `src/lib/roster.js`, `test/roster.test.js`
- Alterar: `src/lib/settings.js`, `test/settings.test.js` (somente para o novo campo `botName`)

## Especificação

### `src/lib/roster.js` (CommonJS, só `node:fs`/`node:path`, sem Electron)
Exportar:
1. `decodeBase32(text)` → string UTF-8 (alfabeto acima, ignora maiúsculas/minúsculas; retorna `null` se houver caractere inválido).
2. `encodeBase32(text)` → string (inverso; usado nos testes e útil para depuração).
3. `findRosterFile(dir)` → caminho absoluto ou `null`. Lista `dir` (se não existir → `null`), decodifica o nome de cada `*.blob`, filtra pelo regex acima. Se houver mais de um (várias contas), escolhe o de `mtime` mais recente.
4. `parseRoster(json)` → array de `{ id, name, color }`:
   - aceita string ou objeto; JSON inválido ou formato inesperado → `[]` (nunca lança);
   - lê `value.rows`; mantém só linhas com `id` válido (`isValidBotId`) e `name` string não vazia;
   - descarta `isRemovedFromSidebar === true` e `isGroup === true`;
   - `color` = `avatarColor` se for string não vazia, senão `null`;
   - `name` com `trim()` e no máximo 80 caracteres;
   - ordena por `lastActivityAt` decrescente (ausente = 0) e, empatando, por nome (`localeCompare` com `'pt-BR'`);
   - remove IDs duplicados (mantém o primeiro).
5. `listBots(dir)` → `{ ok: true, bots }` ou `{ ok: false, error: 'not-found' | 'unreadable' }`. Nunca lança.

### `src/lib/settings.js`
- Adicionar `botName: ''` em `DEFAULT_SETTINGS`.
- `normalizeSettings`: aceitar `botName` string com até 80 caracteres (aplicar `trim()`); senão `''`. Se `botId` final for `''`, `botName` também vira `''`.
- Nada mais muda (manter a remoção do BOM em `loadSettings`).

### Testes
- `test/roster.test.js` (pasta temporária com `fs.mkdtempSync`, removida no final):
  - base32: ida e volta com ASCII, `%7C`, acentos; caractere inválido → `null`; um vetor conhecido: `encodeBase32('sand')` === `'onqw4za'`.
  - `findRosterFile`: pasta inexistente → `null`; pasta sem roster → `null`; com outros `.blob` + o roster → acha o roster; dois rosters de contas diferentes → o mais recente (usar `fs.utimesSync`).
  - `parseRoster`: exemplo válido; JSON inválido; `rows` ausente; filtra removidos, grupos, ID inválido, nome vazio; ordenação; duplicados; nome longo cortado em 80.
  - `listBots`: `not-found`, arquivo ilegível/JSON quebrado → `{ ok: true, bots: [] }` (JSON quebrado não é erro de leitura), caso feliz.
- `test/settings.test.js`: cobrir `botName` (padrão, trim, limite, zera quando `botId` é vazio).

## Critérios de aceite
- `npm test` passa (antigos + novos).
- Sem dependências externas.

## O que NÃO fazer
- NÃO alterar `src/main.js`, janelas, preloads, `src/lib/link.js` ou `package.json` (a interface vem na próxima tarefa).
- NÃO ler a pasta real do Grok Bot do usuário nos testes; usar só a pasta temporária.
- NÃO instalar dependências. NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa.
