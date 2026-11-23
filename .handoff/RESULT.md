# Task 19 - English everywhere and i18n

## Changed files

- `.github/pull_request_template.md`
- `.handoff/HISTORY.md`
- `.handoff/RESULT.md`
- `CONTRIBUTING.md`
- `package.json`
- `scripts/build-icons.js`
- `scripts/check-syntax.js`
- `src/icon.js`
- `src/lib/avatar.js`
- `src/lib/i18n.js`
- `src/lib/markdown.js`
- `src/lib/position.js`
- `src/lib/relative-time.js`
- `src/lib/roster.js`
- `src/lib/settings.js`
- `src/lib/usage.js`
- `src/main.js`
- `src/prompt/prompt.html`
- `src/prompt/prompt.js`
- `src/settings/settings.html`
- `src/settings/settings.js`
- `src/ui/bot-picker.js`
- `test/accelerator.test.js`
- `test/avatar.test.js`
- `test/first-run.test.js`
- `test/history.test.js`
- `test/i18n.test.js`
- `test/ico.test.js`
- `test/link.test.js`
- `test/markdown.test.js`
- `test/position.test.js`
- `test/relative-time.test.js`
- `test/roster.test.js`
- `test/settings.test.js`
- `test/smoke.test.js`
- `test/transcript.test.js`
- `test/usage.test.js`

## Summary

- Added a shared Node/browser i18n module with flat namespaced English keys, placeholder substitution, visible unknown keys, safe fallback behavior, locale constants, and one static HTML localization helper.
- Routed main-process and renderer product text through t(), including tray menus, tooltips, balloons, settings, welcome, errors, accessibility labels, picker options, usage warnings, and delivery states. Both pages load i18n before dependent scripts and retain English HTML fallbacks.
- Localized relative times and usage reset dates with en-US date/time formatting, preserving function signatures and existing time boundaries. Updated locale-dependent bot sorting, search normalization, and initials to English.
- Translated source comments, script diagnostics, test names and fixtures. Kept Unicode coverage through escaped accented English words and non-ASCII validation inputs.
- Translated CONTRIBUTING.md, the PR template, and all existing HISTORY.md rows, retaining dates and outcomes. Added the i18n contribution rule and maintainer review reference. Changed only the package description in package.json.
- Preserved pre-existing staged handoff renames and instructions. No language switch, dependencies, commits, pushes, releases, file deletions, or app launch. Off-limits files were not edited.

## Validation

- npm test: PASS, 98 tests, 0 failures (including 7 new i18n tests).
- npm run check: PASS, syntax valid in 38 JavaScript files.
- git diff --check: PASS.
- The first test run found an outdated expected avatar initial after its fixture was translated; corrected the expectation and the full suite passed.
- Static HTML tests cover localization keys, script order, English language declarations, and text/attribute application. Browser exports and date formatting are covered without launching Electron.

## Questions or blockers

Implementation is complete. The literal repository-wide grep criterion has an environment limitation: Git for Windows reports binary icon matches in off-limits assets/ and build/ files. These are binary byte matches, not remaining Portuguese text. Those files were left untouched. UI symbols that also triggered byte-based matches now use equivalent HTML entities or JavaScript escapes; their display is unchanged.

No product decisions are pending. Visual fit and native window interactions were not tested because TASK.md explicitly prohibits running the app.

## Requested grep output

Executed the exact git grep command from TASK.md. The output below is losslessly represented with non-ASCII characters escaped as Unicode sequences so this English report does not itself introduce accent-scan matches. Exit code 0 means matches were found. Text matches are confined to README.md and .handoff/TASK.md; six additional matches are binary icons.

```text
.handoff/TASK.md:17:- `test/i18n.test.js`: placeholder replacement, unknown key, every key is a non-empty string, no key value contains Portuguese-specific characters (`\u00e3 \u00f5 \u00e7 \u00e9 \u00ea \u00e1 \u00e0 \u00ed \u00f3 \u00fa \u00e2 \u00f4` \u2014 case-insensitive) as a guard against leftovers.
.handoff/TASK.md:27:  - "Pergunte ou pe\u00e7a algo\u2026" \u2192 "Ask or tell Grok anything\u2026"
.handoff/TASK.md:29:  - "<bot> est\u00e1 respondendo\u2026" \u2192 "<bot> is replying\u2026"
.handoff/TASK.md:30:  - "A mensagem n\u00e3o chegou ao Grok Bot." \u2192 "Your message didn't reach Grok Bot."
.handoff/TASK.md:35:  - "Bot padr\u00e3o do Grok Bot" \u2192 "Grok Bot default"; "Outro bot (colar link ou ID)" \u2192 "Other bot (paste link or ID)\u2026"
.handoff/TASK.md:46:- `git grep -n -i -E "[\u00e3\u00f5\u00e7\u00e1\u00e0\u00e2\u00e9\u00ea\u00ed\u00f3\u00f4\u00fa]"` returns **only** `README.md`, `.handoff/TASK.md` lines (README is handled separately) \u2014 i.e. no Portuguese left in code, tests, HTML, CSS or the other docs. Report the command output in RESULT.md.
README.md:6:> **Projeto n\u00e3o oficial, feito pela comunidade.** N\u00e3o tem v\u00ednculo com a xAI nem com os criadores do Grok Bot. O app usa links e arquivos locais do Grok Bot que n\u00e3o s\u00e3o documentados e podem mudar em atualiza\u00e7\u00f5es; ele apenas **l\u00ea** esses arquivos no seu computador e n\u00e3o envia dados para nenhum servidor.
README.md:10:O app gera o link `grokbot://app/v1/prompt?id=<bot>&text=<texto>`, com o texto codificado para uso na URL. O Windows entrega esse link ao Grok Bot. Quando nenhum bot est\u00e1 configurado, o par\u00e2metro `id` \u00e9 omitido e a mensagem vai para o bot padr\u00e3o.
README.md:12:Antes de adicionar a mensagem, o Grok Bot pede confirma\u00e7\u00e3o: "Adicionar mensagem para Grok?". A op\u00e7\u00e3o "N\u00e3o mostrar novamente" fica no pr\u00f3prio Grok Bot. Ao ativ\u00e1-la, qualquer link `grokbot://` passa a adicionar texto sem perguntar; considere esse risco antes de desativar a confirma\u00e7\u00e3o.
README.md:14:## Instalar (para quem s\u00f3 quer usar)
README.md:16:1. Rode `GrokBot-Assistant-Setup-<vers\u00e3o>.exe`. A instala\u00e7\u00e3o \u00e9 de um clique, s\u00f3 para o seu usu\u00e1rio, sem pedir administrador.
README.md:17:2. Como o instalador n\u00e3o \u00e9 assinado digitalmente, o Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informa\u00e7\u00f5es** e depois em **Executar assim mesmo**.
README.md:18:3. Na primeira abertura aparece a tela de boas-vindas com a lista dos seus bots do Grok Bot (o mais usado j\u00e1 vem marcado). Clique em **Salvar e come\u00e7ar**.
README.md:19:4. Pronto: use o atalho indicado (padr\u00e3o `Alt+Space`; se estiver ocupado, o app escolhe outro e avisa) em qualquer lugar. O app inicia junto com o Windows e fica na bandeja.
README.md:21:Requisitos: Windows 10 ou 11 (64 bits) e o Grok Bot instalado e aberto pelo menos uma vez. Para desinstalar, use **Configura\u00e7\u00f5es do Windows > Aplicativos**.
README.md:29:O arquivo sai em `dist/GrokBot-Assistant-Setup-<vers\u00e3o>.exe`. Para refazer os \u00edcones a partir dos SVGs, rode `npm run icons` antes.
README.md:35:- Node.js e npm. A vers\u00e3o do Node.js usada no projeto foi a 26.
README.md:37:## Instala\u00e7\u00e3o para desenvolvimento
README.md:45:Se `node_modules/electron/dist/electron.exe` n\u00e3o existir depois da instala\u00e7\u00e3o, execute:
README.md:59:O app fica na bandeja do sistema, com um \u00edcone azul. Abra o prompt, digite uma mensagem de at\u00e9 1000 caracteres e envie.
README.md:61:| Tecla ou a\u00e7\u00e3o | Resultado |
README.md:63:| Atalho global (padr\u00e3o: `Alt+Space`) | Abre ou fecha o prompt. |
README.md:68:O clique esquerdo no \u00edcone da bandeja abre o prompt. O menu da bandeja oferece **Abrir prompt**, **Configura\u00e7\u00f5es\u2026** e **Sair**. Use **Sair** para encerrar o app.
README.md:70:## Configura\u00e7\u00f5es
README.md:72:Abra **Configura\u00e7\u00f5es\u2026** pelo menu da bandeja e ajuste:
README.md:74:- **Bot de destino:** cole o link do bot (`grokbot://app/v1/agent?id=\u2026` ou `https://cursor.com/grok-bot/link/v1/agent?id=\u2026`) ou apenas o ID. Deixe vazio para usar o bot padr\u00e3o.
README.md:75:- **Atalho:** clique no campo e pressione a combina\u00e7\u00e3o desejada, incluindo um modificador como `Alt` ou `Ctrl`. `Esc` cancela a captura. **Restaurar padr\u00e3o** seleciona `Alt+Space` novamente.
README.md:78:Clique em **Salvar** para aplicar as altera\u00e7\u00f5es. As configura\u00e7\u00f5es ficam em `%APPDATA%\grokbot-assistant\settings.json`.
README.md:80:## Solu\u00e7\u00e3o de problemas
README.md:82:- **O atalho n\u00e3o abre o prompt:** confira se o app est\u00e1 rodando e se o \u00edcone azul aparece na bandeja. Outro programa pode estar usando a combina\u00e7\u00e3o; quando o registro do atalho falha, o app exibe um aviso na bandeja. O PowerToys Run usa `Alt+Espa\u00e7o` por padr\u00e3o. Escolha outra combina\u00e7\u00e3o nas configura\u00e7\u00f5es se houver conflito.
README.md:83:- **A mensagem n\u00e3o chega:** confira se o Grok Bot est\u00e1 instalado e se o ID do bot est\u00e1 correto nas configura\u00e7\u00f5es. Verifique tamb\u00e9m a confirma\u00e7\u00e3o exibida pelo pr\u00f3prio Grok Bot.
README.md:84:- **Iniciar com o Windows:** enquanto n\u00e3o houver instalador, a inicializa\u00e7\u00e3o aponta para o execut\u00e1vel do Electron e a pasta do projeto. Mantenha essa pasta e suas depend\u00eancias no local configurado.
README.md:94:Os testes cobrem a montagem do link, a valida\u00e7\u00e3o do texto e do bot, a leitura e grava\u00e7\u00e3o das configura\u00e7\u00f5es, a convers\u00e3o e valida\u00e7\u00e3o de atalhos e o c\u00e1lculo da posi\u00e7\u00e3o do prompt. A abertura das janelas e o registro do atalho global s\u00e3o verificados manualmente.
README.md:96:| Caminho | Conte\u00fado |
README.md:98:| `src/main.js` | Processo principal do Electron: bandeja, janelas, atalho global e integra\u00e7\u00e3o com o Grok Bot. |
README.md:99:| `src/lib/` | L\u00f3gica de links, configura\u00e7\u00f5es, atalhos e posi\u00e7\u00e3o da janela. |
README.md:101:| `src/settings/` | Interface de configura\u00e7\u00f5es. |
README.md:104:O fluxo de trabalho entre Claude Code e Codex est\u00e1 descrito em `AGENTS.md`. Na pasta `.handoff/`, o Claude Code escreve `TAREFA.md`, o Codex registra a execu\u00e7\u00e3o em `RESULTADO.md` e o Claude Code mant\u00e9m `HISTORICO.md` com o resultado das revis\u00f5es.
README.md:108:Veja o [guia de contribui\u00e7\u00e3o](CONTRIBUTING.md) para preparar o ambiente, testar e abrir um PR.
Binary file assets/icons/icon-256.png matches
Binary file assets/icons/tray-unread.png matches
Binary file assets/icons/tray-unread@2x.png matches
Binary file assets/icons/tray.png matches
Binary file assets/icons/tray@2x.png matches
Binary file build/icon.ico matches
```

Additional Unicode-aware source scan: PASS, no targeted accent characters in any scoped text file, including the new untracked i18n files.
