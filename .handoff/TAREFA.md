# Tarefa 15 (2ª tentativa) — Respiro e ritmo vertical nas configurações

A 1ª tentativa foi revisada por captura e **a estrutura está aprovada** (dropdown, linhas com ícone, grupos). O problema é só **espaçamento**: está tudo espremido.

## Problemas vistos na captura (janela 560×640)
1. O cabeçalho ("Configurações") cola no topo e na borda; o título do primeiro grupo ("DESTINO") fica quase grudado no cabeçalho.
2. Os títulos de grupo ("ATALHO", "COMPORTAMENTO"…) **encostam** no cartão de cima — não há espaço entre um cartão e o próximo título.
3. Os títulos de grupo ficam colados no próprio cartão.
4. O conteúdo encosta nas laterais da janela de forma desigual em relação ao cabeçalho/rodapé.

## Correções pedidas (só CSS de `src/settings/settings.css` e, se preciso, a altura em `src/main.js`)
- Padding lateral **único** de 20 px para cabeçalho, conteúdo e rodapé (alinhados na mesma coluna).
- Cabeçalho: padding `18px 20px 14px`; ícone 32 px; título e subtítulo com `gap` de 2 px; uma divisória fina (`1px solid var(--border)`) embaixo do cabeçalho.
- Título de grupo: `margin: 22px 4px 8px` (o primeiro grupo com `margin-top: 16px`).
- Cartões de grupo: raio 12 px; sem margem extra além do que o título dá.
- Linhas: manter altura mínima 56 px e padding `12px 16px`; `gap` de 12 px entre ícone e textos e de 10 px entre controles à direita.
- Rodapé: divisória fina em cima, padding `14px 20px`.
- Último grupo com `margin-bottom: 16px` antes do rodapé.
- Altura da janela: ajustar em `src/main.js` para **720** (normal) e **800** (boas-vindas) para caber sem rolagem com o novo respiro. Se ainda assim não couber, a área do meio rola (barra fina), cabeçalho/rodapé fixos.
- Conferir o mesmo ritmo no tema claro.

## Critérios de aceite
- `npm test` e `node --check` passam.
- Nenhuma mudança de lógica, HTML estrutural só se indispensável.

## O que NÃO fazer
- NÃO alterar o prompt, o `bot-picker`, `src/lib/*`, preloads, `package.json`.
- Em `src/main.js`, alterar SOMENTE as alturas da janela de configurações.
- NÃO rodar o app. NÃO instalar dependências. NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tentativa.
