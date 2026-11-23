# Resultado — Tarefa 11

## Arquivos alterados
- `package.json`
- `src/main.js`
- `src/settings/settings.html`
- `src/settings/settings.css`
- `src/settings/settings.js`
- `.handoff/RESULTADO.md`

## Arquivos criados
- `src/lib/first-run.js`
- `test/first-run.test.js`

## Resumo das mudanças
- Configurado o empacotamento NSIS x64 com os metadados, arquivos, ícone, atalhos e nome do instalador solicitados; adicionado `npm run dist`.
- Mantida a pasta de dados em `appData/grokbot-assistant`, antes do bloqueio de instância única, e definido o AppUserModelId em `whenReady`.
- Implementadas as funções puras de primeira execução e escolha de atalho, sem repetir tentativas.
- Na primeira execução, as tentativas de registro são desfeitas e apenas o atalho escolhido é registrado por `applyShortcut`; as configurações são salvas, o início com o Windows é ativado somente no app empacotado, e são exibidos boas-vindas e balão da bandeja.
- Nas execuções seguintes, mantido o registro do atalho salvo sem fallback automático e com o aviso existente em caso de falha.
- Adicionado modo boas-vindas por query string, com cartão explicativo, atalho em `kbd`, mensagem quando não há bots e pré-seleção do primeiro bot sem salvar automaticamente. A atualização da lista também permite a pré-seleção quando os bots passam a estar disponíveis, preservando escolhas explícitas do usuário.
- No modo boas-vindas, o botão mostra “Salvar e começar” e fecha a janela cerca de 800 ms após salvar com sucesso. A janela usa `setSize(520, 780)` nesse modo e mantém 720 de altura no modo normal; o conteúdo usa a rolagem interna da lista de bots.
- Mantida a CSP e usadas APIs de DOM sem `innerHTML`.
- `.gitignore` já contém `dist/`; nenhuma alteração foi necessária.
- Preservadas as alterações preexistentes em `.handoff/TAREFA.md`, `package-lock.json` e a dependência já adicionada em `package.json`.

Dependência nova: electron-builder 26.18.1 — instalada pelo Claude Code para gerar o instalador NSIS

## Testes executados e resultado
- `npm test`: 55 testes passaram, sem falhas, incluindo cinco testes novos de primeira execução e fallback.
- `node --check src/main.js`: passou.
- `node --check src/lib/first-run.js`: passou.
- `node --check src/settings/settings.js`: passou.
- `node --check test/first-run.test.js`: passou.
- `node -e "require('./package.json')"`: passou.
- `git diff --check`: passou; somente avisos do Git sobre normalização futura de LF para CRLF.

## Dúvidas ou bloqueios
- Nenhum bloqueio de implementação.
- A validação visual, o registro real de atalhos, o balão, o início com o Windows e o instalador aguardam a verificação manual do Claude Code. Conforme solicitado, não rodei o app, não gerei o instalador e não instalei dependências.
- Não fiz commit nem push.
