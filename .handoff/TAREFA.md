# Tarefa 10 — Abrir as configurações a partir do prompt

## Objetivo
Dar acesso às configurações direto da caixa do prompt: um botão de engrenagem no cabeçalho e o atalho `Ctrl+,`.

## Arquivos envolvidos
- `src/prompt/prompt.html`, `src/prompt/prompt.css`, `src/prompt/prompt.js`
- `src/preload.js`
- `src/main.js`

## Especificação
1. **Cabeçalho do prompt**: manter a pílula "Para <bot>" à esquerda e adicionar, alinhado à **direita**, um botão só com ícone de engrenagem:
   - `<button id="settings" type="button" aria-label="Abrir configurações" title="Configurações (Ctrl+,)">` contendo um **SVG inline** de engrenagem (16×16, `stroke="currentColor"`, `fill="none"`, traço 1,5–1,75, cantos arredondados; sem imagens externas). SVG inline no HTML é permitido pela CSP atual (não é script nem estilo inline — não usar atributo `style`).
   - Estilo: 28×28 px, sem borda, fundo transparente, cor secundária, raio 8 px; hover com fundo `var(--hover)` e cor `var(--text)`; foco visível igual aos outros botões. Uma rotação sutil do ícone no hover (≈ 30°, com a transição padrão) é bem-vinda, respeitando `prefers-reduced-motion`.
   - O cabeçalho vira `display: flex; align-items: center; justify-content: space-between;` sem mudar a altura atual de forma perceptível.
2. **Teclado**: no `keydown` do documento (ou do `textarea`), `Ctrl+,` (`event.ctrlKey && event.key === ','`, sem `Alt`/`Shift`) abre as configurações (`preventDefault`). Acrescentar `Ctrl+,` ajustes` às dicas do rodapé **somente se** couber sem quebrar linha na largura atual; se não couber, deixar só no `title` do botão.
3. **Preload** (`src/preload.js`): expor `openSettings()` → `ipcRenderer.invoke('prompt:open-settings')`.
4. **Main** (`src/main.js`): `ipcMain.handle('prompt:open-settings', ...)` → esconde o prompt e chama `openSettings()` (a função que já existe). O texto digitado no prompt é preservado (não limpar o `textarea`).

## Critérios de aceite
- `npm test` passa; `node --check` em `src/main.js`, `src/preload.js`, `src/prompt/prompt.js`.
- Segurança mantida (CSP inalterada, sem `innerHTML`, sem atributos `style`/`on*` inline).
- O resto do prompt continua igual (Enter, Shift+Enter, Esc, crescimento, animações).

## O que NÃO fazer
- NÃO alterar `src/settings/*`, `src/lib/*`, `src/ui/tokens.css`, `assets/`, `scripts/`, `package.json`.
- NÃO rodar o app. NÃO instalar dependências. NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa.
