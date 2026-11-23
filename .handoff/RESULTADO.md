# Resultado — Tarefa 12

## Arquivos alterados
- `src/lib/roster.js`
- `src/lib/settings.js`
- `test/settings.test.js`
- `.handoff/RESULTADO.md`

## Arquivos criados
- `src/lib/transcript.js`
- `test/transcript.test.js`
- `src/lib/markdown.js`
- `test/markdown.test.js`

## Resumo das mudanças
- Extraída e exportada `findPersistenceFile`, com seleção pelo mtime mais recente e retorno null em falhas. `findRosterFile` usa essa função; `listBots` preserva a distinção anterior entre ausência e erro de leitura.
- Implementadas resolução do bot por last-agent, localização de conversa com ID escapado, leitura, filtragem, ordenação por seq e timestamp, última resposta e seleção das trocas recentes. Entradas sem ID textual não vazio são descartadas; valores numéricos ausentes ou inválidos são normalizados para zero. JSON quebrado produz conversa com entradas vazias, seguindo a tolerância de `parseTranscript`.
- Implementado parser Markdown em árvore de nós, com parágrafos, quebras, títulos de níveis 1 a 3, listas, código cercado, citações, formatação inline e links restritos a http/https. Marcação não fechada permanece literal; a profundidade inline tem limite para evitar recursão excessiva. Exportação CommonJS e global de navegador.
- Adicionado `afterSend`, padrão wait, aceitando wait e hide na normalização e persistência.

## Testes executados e resultado
- `npm test`: 72 testes aprovados, zero falhas, incluindo a suíte anterior.
- Cobertura nova: blobs temporários em base32, seleção por bot e mtime, escape de regex, last-agent, arquivos ausentes, JSON quebrado, erro de leitura simulado, filtragem, ordenação, última resposta com corte estrito e limite de trocas recentes.
- Markdown: todos os tipos solicitados, negrito com código interno, esquemas de link rejeitados, HTML literal, marcação incompleta, código não fechado, texto vazio e exportação no contexto de navegador sem CommonJS.
- Configurações: valores válidos e inválidos de afterSend, configuração antiga sem o campo e persistência de wait/hide.
- `git diff --check`: sem erros de whitespace; Git exibiu apenas avisos de normalização LF/CRLF.
- Testes de persistência utilizaram somente pastas temporárias; a pasta real do Grok Bot não foi lida.

## Dúvidas ou bloqueios
Nenhum. Sem dependências novas. Sem alterações de interface, main, preloads ou package.json. Sem commit ou push. A alteração já existente em `.handoff/TAREFA.md` foi preservada.
