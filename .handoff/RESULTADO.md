# Resultado — Tarefa 2: Montagem do link do Grok Bot

## Arquivos alterados
- `src/lib/link.js` (criado).
- `test/link.test.js` (criado).
- `.handoff/RESULTADO.md` (substituído pelo resultado desta tarefa).

## Resumo das mudanças
- Implementadas as exportações CommonJS `MAX_TEXT_LENGTH`, `validateText`, `isValidBotId`, `parseBotId` e `buildPromptLink`.
- Validação do texto após trim, com limite de 1000 pontos de código para contar emojis como um caractere.
- Validação de IDs e extração de IDs puros ou dos quatro formatos de link especificados, usando `new URL` dentro de try/catch.
- Montagem do link de prompt com `URLSearchParams`, ID opcional antes do texto e espaços codificados como `%20`, preservando sinais de `+` como `%2B`.
- Funções puras, sem Electron, efeitos colaterais ou dependências externas. Nenhuma dependência instalada.

## Testes executados e resultado
- `npm test`: aprovado, 9 testes passaram e 0 falharam (8 novos e 1 anterior).
- Cobertos textos vazios e não strings, limites de caracteres e emojis, trim, ida e volta de caracteres especiais e quebra de linha, codificação de espaços, ordem e ausência de ID, IDs inválidos e formatos de link aceitos e rejeitados.

## Dúvidas ou bloqueios
- Nenhum.
- A alteração preexistente em `.handoff/TAREFA.md` foi preservada. Não foram feitos commit ou push.
