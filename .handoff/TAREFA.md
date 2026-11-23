# Tarefa 1 — Esqueleto do projeto Electron com ícone na bandeja

## Objetivo
Criar a base do app: um projeto Node/Electron que, ao rodar `npm start`, fica apenas como ícone na bandeja do sistema (sem janela visível), com um menu mínimo contendo "Sair".

## Arquivos envolvidos (criar)
- `package.json`
- `src/main.js` (processo principal do Electron)
- `src/icon.js` (gera o ícone da bandeja em código)
- `test/smoke.test.js` (teste mínimo para o `npm test` não falhar vazio)

## Especificação
1. `package.json`:
   - `"name": "grokbot-assistant"`, `"version": "0.1.0"`, `"private": true`, `"main": "src/main.js"`.
   - `"description"` em português.
   - Scripts: `"start": "electron ."` e `"test": "node --test"`.
   - `devDependencies`: `"electron": "45.2.3"` (versão EXATA, sem `^` nem `~`).
   - Nenhuma outra dependência.
2. `src/main.js` (CommonJS, `require`):
   - Usa `app.requestSingleInstanceLock()`; se não obtiver o lock, chama `app.quit()` e não segue.
   - Em `app.whenReady()`: cria um `Tray` com o ícone de `src/icon.js`, tooltip `"GrokBot Assistant"` e menu de contexto com um único item `"Sair"` que chama `app.quit()`.
   - Mantém a referência ao `Tray` numa variável de módulo (para não ser coletado pelo garbage collector).
   - Trata `window-all-closed` sem encerrar o app (o app vive na bandeja).
   - Não cria nenhuma `BrowserWindow` nesta tarefa.
3. `src/icon.js`:
   - Exporta uma função `createTrayIcon()` que retorna um `nativeImage` de 16x16 gerado em código (por exemplo, `nativeImage.createFromBitmap` com um buffer BGRA de um círculo ou quadrado azul `#1080f3`).
   - Não baixar nem copiar imagens de fora do projeto.
4. `test/smoke.test.js`:
   - Usa `node:test` e `node:assert`.
   - Verifica que o `package.json` tem os scripts `start` e `test` e que `electron` está fixado em `45.2.3`.

## Critérios de aceite
- `npm test` passa (rodado por você mesmo).
- `src/main.js` e `src/icon.js` não têm erro de sintaxe (`node --check src/main.js` e `node --check src/icon.js`).
- Código com comentários curtos em português onde ajudar.

## O que NÃO fazer
- NÃO rodar `npm install` (o Claude Code instala depois de revisar; a rede pode estar bloqueada no sandbox).
- NÃO criar janela, atalho global, configurações ou lógica de link (são tarefas futuras).
- NÃO adicionar dependências além do `electron`.
- NÃO fazer commit nem push.
- NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Preencha `.handoff/RESULTADO.md` com: arquivos alterados, resumo das mudanças, testes executados e resultado, dúvidas ou bloqueios.
