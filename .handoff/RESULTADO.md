# Resultado — Tarefa 16

## Arquivos criados

- `CONTRIBUTING.md`.
- `.gitattributes`.
- `.editorconfig`.
- `.github/workflows/ci.yml`.
- `.github/pull_request_template.md`.
- `scripts/check-syntax.js`.

## Arquivos alterados

- `README.md`: somente seção curta “Contribuindo” ao final.
- `package.json`: somente script `check` e campo `engines.node`.
- `.handoff/RESULTADO.md`: conteúdo substituído pelo resultado desta tarefa.

## Resumo das mudanças

- Guia em português do Brasil com ambiente, comandos, estrutura, regras, fluxo de contribuição e relato de problemas, conferido com o código existente.
- Descrita a técnica de teste isolado com pasta temporária de appData e interceptação de `shell.openExternal`, sem criar script Electron adicional.
- Verificador recursivo de sintaxe usando Node puro; informa arquivos com falha e retorna código 1 se houver erro.
- CI para push e PR destinados à main, em Windows com Node 22, instalação sem scripts, verificação de sintaxe e testes; permissões limitadas à leitura do conteúdo.
- Modelo de PR com as seções e caixas de seleção solicitadas.
- Configurados atributos Git e EditorConfig conforme a tarefa. Preservados os fins de linha dos arquivos existentes; sem renormalização.
- A alteração preexistente em `.handoff/TAREFA.md` foi preservada.

## Testes executados e resultado

- `npm run check`: aprovado, “Sintaxe ok (34 arquivos)”.
- `npm test`: 82 testes aprovados, zero falhas.
- YAML analisado com `js-yaml` já disponível nas dependências locais; estrutura, eventos, permissões, versões e comandos conferidos por asserções. Indentação em múltiplos de 2 espaços, sem tabs.
- Falha do verificador simulada em memória com `node:vm`: confirmado código 1, diagnóstico do arquivo e continuidade da verificação dos 34 arquivos, sem modificar código ou testes existentes.
- Conferência automatizada: README original preservado integralmente antes da seção acrescentada; package.json sem outras mudanças; fins de linha preservados.
- Arquivos novos conferidos quanto a LF, quebra final e ausência de caminhos pessoais e e-mails; revisão do conteúdo sem dados pessoais, tokens ou chaves.
- `git diff --check`: aprovado, sem erros de whitespace.
- Validações locais executadas com Node v26.13.1. O workflow configura Node 22; a execução no GitHub Actions depende do envio pelo mantenedor.

## Dúvidas ou bloqueios

- Nenhuma dúvida ou bloqueio de implementação.
- Nenhuma dependência instalada, nenhum arquivo apagado e nenhum commit, push ou deploy realizado.
