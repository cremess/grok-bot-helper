# Tarefa 2 — Montagem do link do Grok Bot (lógica pura, com testes)

## Contexto
O Grok Bot (app desktop) aceita o deep link:
`grokbot://app/v1/prompt?id=<ID do bot>&text=<texto>`
- `text` é obrigatório: depois de decodificado, tem no máximo 1000 caracteres e precisa ter pelo menos um caractere que não seja espaço.
- `id` é opcional: o ID do bot de destino, regex `^[A-Za-z0-9_-]{1,128}$`. Sem `id`, o Grok Bot usa o bot padrão.
- O Grok Bot também gera links de bot nestes formatos (o usuário pode colar qualquer um nas configurações):
  - `grokbot://app/v1/agent?id=<ID>`
  - `sand://app/v1/agent?id=<ID>`
  - `https://cursor.com/grok-bot/link/v1/agent?id=<ID>`
  - `https://cursor.com/sand/link/v1/agent?id=<ID>`
  - ou só o ID puro.

## Arquivos envolvidos (criar)
- `src/lib/link.js`
- `test/link.test.js`

## Especificação de `src/lib/link.js` (CommonJS, SEM `require('electron')`)
Exportar:
1. `MAX_TEXT_LENGTH = 1000`
2. `validateText(text)` → `{ ok: true, text: <texto com trim> }` ou `{ ok: false, error: <código> }`, com os códigos:
   - `'empty'` se não for string ou ficar vazio após `trim()`;
   - `'too-long'` se, após `trim()`, tiver mais que `MAX_TEXT_LENGTH` caracteres (contar com `[...texto].length`, para emojis contarem como 1).
3. `isValidBotId(id)` → boolean (regex acima).
4. `parseBotId(input)` → string com o ID ou `null`:
   - aplica `trim()`;
   - se for ID puro válido, retorna ele;
   - se for URL (usar `new URL`, dentro de `try/catch`), aceita SOMENTE os formatos listados acima (protocolos `grokbot:`/`sand:` com host `app` e caminho `/v1/agent`; ou `https:` com host `cursor.com` e caminho `/grok-bot/link/v1/agent` ou `/sand/link/v1/agent`), lê `searchParams.get('id')` e retorna se for válido;
   - qualquer outra coisa → `null`.
5. `buildPromptLink({ text, botId })` → `{ ok: true, url }` ou `{ ok: false, error }`:
   - valida o texto com `validateText` (repassa o erro);
   - se `botId` for informado (não vazio) e inválido → `{ ok: false, error: 'invalid-bot-id' }`;
   - monta `grokbot://app/v1/prompt` com `URLSearchParams`, colocando `id` primeiro (quando houver) e depois `text` (já com trim);
   - o texto deve ir codificado de forma que espaços virem `%20` e não `+` (substituir `+` por `%20` no resultado de `URLSearchParams.toString()` é aceitável, pois `+` literal já vira `%2B`).

## Testes em `test/link.test.js` (node:test + node:assert)
Cobrir no mínimo:
- texto vazio, só espaços e não string → `empty`;
- texto com exatamente 1000 caracteres → ok; com 1001 → `too-long`; 1000 emojis → ok;
- trim aplicado no link;
- acentos, `&`, `=`, `#`, `+`, `?` e quebra de linha sobrevivem ida e volta (decodificar o link gerado com `new URL(...).searchParams.get('text')` e comparar);
- espaço vira `%20` no link;
- com `botId` válido, o link tem `id=` antes de `text=`; sem `botId`, não tem `id`;
- `botId` inválido (`'abc def'`, `'a/b'`, 129 caracteres) → `invalid-bot-id`;
- `parseBotId` com ID puro, os 4 formatos de link, link com espaços em volta, host errado (`https://evil.com/grok-bot/link/v1/agent?id=x`), caminho errado, link sem `id` e lixo → resultado esperado.

## Critérios de aceite
- `npm test` passa com todos os testes (os antigos e os novos).
- Funções puras, sem efeitos colaterais e sem dependências externas.

## O que NÃO fazer
- NÃO alterar `src/main.js`, `src/icon.js`, `package.json` nem outros arquivos fora da lista.
- NÃO instalar dependências.
- NÃO fazer commit nem push.
- NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa: arquivos alterados, resumo, testes executados e resultado, dúvidas ou bloqueios.
