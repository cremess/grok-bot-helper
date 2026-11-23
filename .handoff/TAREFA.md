# Tarefa 16 — Preparar o repositório para contribuidores

## Contexto
O Pedro vai passar o repositório para amigos contribuírem. Precisamos de: guia de contribuição, CI que roda os testes em cada push/PR, modelo de PR, padronização de fim de linha e de editor. Tudo em português do Brasil.

## Arquivos envolvidos
- Criar: `CONTRIBUTING.md`, `.gitattributes`, `.editorconfig`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `scripts/check-syntax.js`
- Alterar: `README.md` (só acrescentar seção curta "Contribuindo" no fim apontando para o `CONTRIBUTING.md`), `package.json` (só os campos abaixo)

## 1. `.gitattributes`
```
* text=auto eol=lf
*.png binary
*.ico binary
*.jpg binary
*.exe binary
```

## 2. `.editorconfig`
UTF-8, LF, 2 espaços, `insert_final_newline = true`, `trim_trailing_whitespace = true` (exceto `*.md`: `trim_trailing_whitespace = false`).

## 3. `scripts/check-syntax.js` (Node puro, sem dependências)
- Percorre `src/`, `scripts/` e `test/` (recursivo), roda `node --check` em cada `.js` via `child_process.spawnSync(process.execPath, ['--check', arquivo])`, imprime os que falharem e sai com código 1 se algum falhar; senão imprime "Sintaxe ok (N arquivos)".
- `package.json`: script `"check": "node scripts/check-syntax.js"` e `"engines": { "node": ">=22" }`. Nada mais muda no `package.json`.

## 4. `.github/workflows/ci.yml`
- Nome "CI"; dispara em `push` e `pull_request` para `main`.
- Job `test` em `windows-latest`:
  - `actions/checkout@v4`
  - `actions/setup-node@v4` com `node-version: 22` e `cache: npm`
  - `npm ci --ignore-scripts` (evita baixar o binário do Electron no CI; os testes não precisam dele)
  - `npm run check`
  - `npm test`
- Sem segredos, sem publicação, `permissions: contents: read`.

## 5. `.github/pull_request_template.md`
Seções curtas com caixas de seleção: "O que muda", "Como testei" (testes automáticos / teste manual no Windows com o Grok Bot / capturas de tela anexadas se mudou interface), "Checklist" (npm test passa, npm run check passa, textos em pt-BR, sem `innerHTML`, sem dados pessoais/tokens).

## 6. `CONTRIBUTING.md`
Conteúdo (confira tudo no código antes de escrever; não invente):
1. **Visão geral** em 3–4 linhas: o que o app faz e como fala com o Grok Bot (deep link `grokbot://app/v1/prompt` para enviar; leitura somente leitura dos arquivos locais do Grok Bot para lista de bots e conversa — formato interno, pode mudar em atualizações do Grok Bot).
2. **Preparar o ambiente**: Windows 10/11, Node 22+, Git, Grok Bot instalado; `git clone`, `npm install` (com a observação do `node node_modules/electron/install.js` se o binário não vier), `npm start`.
3. **Comandos**: `npm start`, `npm test`, `npm run check`, `npm run icons`, `npm run dist` — uma linha cada.
4. **Estrutura de pastas**: tabela curta (`src/main.js`, `src/lib/` lógica pura testável, `src/prompt/`, `src/settings/`, `src/ui/` tokens e BotPicker, `assets/`, `scripts/`, `test/`, `.handoff/` = registro do fluxo Claude Code + Codex usado pelo mantenedor; contribuidores não precisam usar).
5. **Regras do código**:
   - CommonJS; lógica nova de preferência em `src/lib/` com testes em `test/` (`node:test`).
   - Segurança das janelas: `contextIsolation`, `sandbox`, sem `nodeIntegration`; CSP sem `unsafe-inline`; **nunca** `innerHTML` com conteúdo externo (nomes de bots e mensagens vêm de arquivos do Grok Bot); deep links e `openExternal` só no processo principal e com IDs validados.
   - Nada de dados pessoais, tokens ou caminhos do seu PC no código ou nos testes; testes usam pastas temporárias.
   - Textos de interface e comentários em português do Brasil.
   - Novas dependências: discutir no PR antes.
6. **Testar sem gastar tokens do Grok Bot**: explicar a técnica usada no projeto — rodar um script Electron que chama `app.setPath('appData', <pasta temporária>)` antes de carregar `src/main.js`, copiar para essa pasta só os arquivos necessários do Grok Bot e interceptar `shell.openExternal`; assim dá para simular envio e resposta sem tocar no Grok Bot real. (Só descrever; não criar o script.)
7. **Fluxo de contribuição**: criar branch a partir da `main` (`feat/…`, `fix/…`), commits pequenos com mensagem no imperativo em português, abrir PR para `main`, CI precisa passar, pedir revisão do Pedro; mudanças de interface com captura de tela no PR.
8. **Reportar problemas**: abrir issue com passos, o que esperava, o que aconteceu, versão do Windows e do Grok Bot.

## Critérios de aceite
- `npm run check` e `npm test` passam localmente.
- YAML do workflow válido (indentação de 2 espaços, sem tabs).
- Nenhum dado pessoal (nome de usuário, e-mail, caminhos `C:\Users\...`) nos arquivos novos.

## O que NÃO fazer
- NÃO alterar código em `src/`, testes existentes, `assets/`, `AGENTS.md`, `.gitignore`, `.handoff/HISTORICO.md`.
- NÃO renormalizar os fins de linha dos arquivos existentes (o Claude Code faz isso depois, num commit separado).
- NÃO instalar dependências. NÃO fazer commit nem push.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa.
