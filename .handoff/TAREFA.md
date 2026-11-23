# Tarefa 18 (ajuste) — Resposta ocupa o espaço quando a janela foi redimensionada pelo usuário

A Tarefa 18 foi testada e **aceita** no comportamento (mover, redimensionar, lembrar, fixar, restaurar). Falta um ajuste visual:

## Problema
Com a janela redimensionada pelo usuário (ex.: 820×520), a última resposta continua **recolhida em ~5 linhas** com "Ver mais", deixando um grande espaço vazio entre a resposta e o campo de texto.

## Correção pedida (`src/main.js`, `src/prompt/prompt.js|css`)
- O main informa ao prompt se o tamanho é do usuário: incluir `userSized: Boolean(settings.promptBounds)` no `prompt:show` e enviar `prompt:user-sized` (boolean) quando isso mudar (após salvar bounds manuais e após `prompt:reset-bounds`).
- No prompt, com `userSized === true`:
  - a área de resposta **não fica recolhida**: sem limite de 5 linhas, sem degradê e **sem** "Ver mais"/"Ver menos"; ela ocupa toda a altura disponível da área de conteúdo (`flex: 1; min-height: 0`) e rola internamente se o texto for maior;
  - a visão "Conversa" também ocupa a altura disponível;
  - o campo + rodapé continuam fixos embaixo.
- Com `userSized === false`, manter exatamente o comportamento atual (recolhido + "Ver mais" + auto-altura).

## Critérios de aceite
- `npm test` e `npm run check` passam.
- Nenhuma outra mudança de comportamento.

## O que NÃO fazer
- NÃO alterar `src/lib/*`, `src/settings/*`, `bot-picker`, `assets/`, `scripts/`, `package.json`.
- NÃO rodar o app. NÃO instalar dependências. NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado deste ajuste.

## Resposta do Claude Code à dúvida registrada
Autorizado alterar `src/preload.js` SOMENTE para expor `onUserSized(callback)` (evento `prompt:user-sized`), no mesmo padrão dos outros eventos. Nada mais no preload.

