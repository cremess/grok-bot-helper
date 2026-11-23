# Resultado — Tarefa 4: Janela do prompt + atalho global

## Arquivos alterados
- `src/main.js`
- `src/preload.js` (criado)
- `src/prompt/prompt.html` (criado)
- `src/prompt/prompt.css` (criado)
- `src/prompt/prompt.js` (criado)
- `src/lib/position.js` (criado)
- `test/position.test.js` (criado)
- `.handoff/RESULTADO.md` (substituído conforme o protocolo)

## Resumo das mudanças
- Configurações carregadas em `whenReady` e uma única janela de prompt inicialmente escondida, com as opções solicitadas.
- Atalho configurável por `applyShortcut`, desregistro do anterior e aviso pela bandeja em caso de retorno falso ou exceção. Desregistro de todos os atalhos ao encerrar.
- Alternância da janela no monitor do cursor, foco, envio do bot ao renderer, ocultação ao perder foco e abertura na segunda instância se escondida.
- IPC de envio usando `buildPromptLink`, conferência do prefixo permitido, abertura externa com tratamento de erro e ocultação após sucesso; IPC separado para esconder.
- Preload restrito a `submit`, `hide` e `onShow`; isolamento de contexto e sandbox ativos, integração Node desativada, navegação e novas janelas bloqueadas e CSP sem código inline.
- Interface escura com textarea, destino, contador por pontos de código Unicode, alerta acima de 1000 caracteres e erros em português. Enter envia fora da composição, Shift+Enter mantém a quebra e Esc esconde. Ao mostrar, seleciona o texto existente; após envio bem-sucedido, limpa o texto.
- Posicionamento puro com limites da área disponível e quatro testes: monitor principal, monitor com coordenadas negativas, área menor que a janela e limite vertical com arredondamento horizontal. Quando a janela excede a área, a posição é ancorada na origem dessa área.
- Mantidos a trava de instância única, o menu da bandeja com “Sair” e o funcionamento sem janelas abertas.

## Testes executados e resultado
- `npm test`: aprovado; 22 testes passaram, nenhuma falha (antigos e novos).
- `node --check src/main.js`: aprovado.
- `node --check src/preload.js`: aprovado.
- `node --check src/prompt/prompt.js`: aprovado.
- `node --check src/lib/position.js`: aprovado.
- `git diff --check`: aprovado; somente aviso de conversão futura de LF para CRLF em `src/main.js`.
- O app não foi aberto e `npm start` não foi executado, conforme solicitado. Validação gráfica e do atalho real pendente para o Claude Code.

## Dúvidas ou bloqueios
- Nenhum bloqueio de implementação.
- Nenhuma dependência instalada. Nenhum commit ou push realizado.
- A alteração preexistente em `.handoff/TAREFA.md` foi preservada. Os módulos indicados como imutáveis e os demais arquivos fora do escopo não foram alterados.
