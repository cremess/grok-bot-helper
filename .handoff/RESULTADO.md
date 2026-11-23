# Resultado — Tarefa 14

## Arquivos alterados

- `src/main.js`
- `src/preload.js`
- `src/settings-preload.js`
- `src/prompt/prompt.html`
- `src/prompt/prompt.css`
- `src/prompt/prompt.js`
- `src/settings/settings.html`
- `src/settings/settings.css`
- `src/settings/settings.js`
- `src/lib/settings.js`
- `test/settings.test.js`
- `.handoff/RESULTADO.md`

## Arquivos criados

- `src/lib/history.js`
- `test/history.test.js`

## Resumo das mudanças

- A pílula de destino virou botão com menu de bots, avatares, seleção atual e opção de bot padrão no fim. Abre por clique ou Ctrl+K; aceita setas, Home, End, Enter e Esc, fecha ao clicar fora e ajusta a altura do prompt. A seleção persiste o destino, encerra a espera anterior e carrega a conversa correspondente.
- Acrescentados os botões SVG para copiar a última resposta em markdown e abrir a conversa no Grok Bot. Clipboard limitado a 20.000 caracteres no main; abertura usa ID validado ou o link genérico. A cópia exibe uma marca de confirmação por 1,2 segundo.
- O degradê e o botão de expansão dependem da medição real do conteúdo recolhido, recalculada após renderização e redimensionamento.
- Histórico de até 50 envios com trim, deduplicação, arquivo em userData e gravação atômica. Setas percorrem os envios quando o campo está vazio ou já está navegando; edição encerra a navegação. Configurações permitem limpar com confirmação inline.
- Incluída notificação opcional, desligada por padrão, quando a resposta chega com o prompt fechado. O texto remove marcação simples e fica limitado a 140 caracteres; clicar abre o prompt e limpa o indicador de não lido.
- Incluídos os temas Sistema, Escuro e Claro, persistidos e aplicados pelo nativeTheme. O fundo da janela de configurações acompanha o tema efetivo.
- Cartão Geral reorganizado na ordem solicitada, com controles à direita. Configurações usam altura de 860 px, ou 900 px nas boas-vindas, com rolagem apenas na área central e sem rolagem interna concorrente da lista de bots.
- Novas opções validadas no IPC de configurações com erro `invalid-option`; arquivos antigos continuam recebendo os padrões.

## Testes e verificações

- `npm test`: **82 testes aprovados, 0 falhas**, incluindo os novos testes de histórico e as verificações de padrão, normalização e persistência de tema/notificação.
- `node --check`: aprovado nos nove arquivos JavaScript alterados ou criados (`main.js`, os dois preloads, os dois renderers, `settings.js` e `history.js` da biblioteca, e os dois arquivos de teste).
- `git diff --check`: aprovado.
- Revisão estática: CSP preservada; nenhum uso de `innerHTML` introduzido; clipboard e montagem dos novos deep links restritos ao main, com validação de ID.

## Dúvidas, bloqueios e limites da validação

- Sem dúvidas ou bloqueios de implementação.
- O app não foi executado, conforme a tarefa. Permanecem para validação manual pelo orquestrador: layout nos tamanhos e temas efetivos, navegação por teclado, interação com o Grok Bot, notificações reais do Windows e comportamento do clipboard.
- Se a gravação do histórico falhar após a abertura bem-sucedida do Grok Bot, o envio continua sendo considerado realizado e o histórico permanece em memória durante a sessão.
- Nenhuma dependência instalada, instalador gerado, commit ou push realizado. As alterações preexistentes em `.handoff/TAREFA.md` e `.handoff/HISTORICO.md` foram preservadas.
