# Tarefa 9 (2ª tentativa) — Ajustes visuais do prompt e das configurações

A 1ª tentativa foi revisada visualmente pelo Claude Code (capturas das janelas). A lógica está aceita; faltam ajustes de acabamento. **Mexa só em CSS/HTML/JS de interface e na altura da janela de configurações.** Mantenha todo o resto da Tarefa 9 como está.

## Problemas encontrados e correções pedidas

### Prompt (`src/prompt/*`)
1. O `textarea` mostra um retângulo azul de foco (`:focus-visible` global), com cara de formulário. No prompt, o campo deve ficar **sem contorno nem borda** quando focado (`#message:focus, #message:focus-visible { outline: none; }`). O foco já é óbvio pelo cursor. Mantenha o anel de foco nos botões.
2. Dar um pouco mais de respiro: `padding` do cartão `14px 18px`, `margin-bottom` do cabeçalho `10px`.

### Configurações (`src/settings/*` e a altura em `src/main.js`)
3. **Rolagem dupla**: hoje a página inteira rola E a lista de bots rola dentro, as duas com barra de rolagem padrão do Windows, larga e clara. Corrigir:
   - Aumentar a janela para `height: 720` (em `src/main.js`, só esse número) e organizar o layout para que **a página não role** na altura padrão. Use `body` em grid/flex com altura `100vh`, cabeçalho e rodapé fixos e a área do meio com `overflow: auto` só como reserva.
   - A **única** área que rola normalmente é a lista de bots (`max-height` ~ 236 px).
   - Estilizar as barras de rolagem para o tema: `::-webkit-scrollbar { width: 10px }`, trilho transparente, polegar `var(--border)` mais forte (por exemplo `rgba(255,255,255,.18)` no escuro e `rgba(0,0,0,.2)` no claro), arredondado, com `border: 3px solid transparent; background-clip: padding-box`.
4. **Itens da lista mais compactos**: altura ~44 px, avatar 28 px, `gap` 6 px, raio 10 px.
5. **A opção selecionada tem que ficar visível e evidente**:
   - Ordem da lista: **"Bot padrão do Grok Bot" primeiro**, depois os bots do Grok Bot, e **"Outro bot (colar link ou ID)" por último**.
   - Item selecionado: borda de 1,5 px na cor do acento, fundo levemente tingido (`color-mix(in srgb, var(--accent) 12%, var(--surface))`) e um ícone de "check" (✓ ou círculo preenchido) alinhado à direita, no lugar onde hoje fica o selo. Se o item selecionado também for o "mais usado", mostrar os dois: o selo antes do check.
   - Ao abrir e após "Atualizar lista", rolar a lista até o item selecionado (`scrollIntoView({ block: 'nearest' })`).
   - Hover sutil nos itens (`var(--hover)`).
6. **Atalho**: colocar `Alterar` e `Restaurar padrão` **na mesma linha, à direita das teclas** (teclas à esquerda, botões à direita). "Restaurar padrão" deve ser um botão de texto discreto (sem borda); "Alterar" é um botão secundário.
7. **Geral**: tem que aparecer sem rolar (vem com o item 3). O interruptor fica à direita do texto "Iniciar com o Windows", com uma linha de ajuda menor embaixo: "Abre o GrokBot Assistant ao entrar no Windows".
8. Cabeçalho e cartões: espaçamento consistente (16 px entre cartões, `padding` 16 px). Títulos de seção em 13 px, peso 600, cor secundária, MAIÚSCULAS com `letter-spacing: .04em`.

## Critérios de aceite
- `npm test` passa e `node --check` passa nos `.js` alterados.
- Nenhuma mudança de lógica de IPC, de salvamento ou de segurança (CSP, isolamento, `textContent`).
- Na altura padrão (720), a janela de configurações mostra os 3 cartões e o rodapé **sem barra de rolagem na página**.

## O que NÃO fazer
- NÃO alterar `src/lib/*`, `src/icon.js`, `assets/`, `scripts/`, `package.json`, preloads.
- Em `src/main.js`, alterar SOMENTE a altura da janela de configurações.
- NÃO rodar o app. NÃO instalar dependências. NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tentativa.
