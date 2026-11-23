# Tarefa 3 — Configurações salvas em JSON (lógica, com testes)

## Objetivo
Criar o módulo que carrega, valida e salva as configurações do app num arquivo JSON. O caminho do arquivo é recebido por parâmetro (o `main.js` vai passar `app.getPath('userData')/settings.json` numa tarefa futura). Este módulo NÃO usa Electron.

## Arquivos envolvidos (criar)
- `src/lib/settings.js`
- `test/settings.test.js`

## Especificação de `src/lib/settings.js` (CommonJS, só `node:fs` e `node:path`)
Exportar:
1. `DEFAULT_SETTINGS` (congelado com `Object.freeze`):
   ```js
   { botId: '', shortcut: 'Alt+Space', launchAtLogin: false }
   ```
2. `isValidShortcut(value)` → boolean. Formato de acelerador do Electron: partes separadas por `+`, sem espaços.
   - Modificadores aceitos: `Alt`, `Shift`, `Control`, `Ctrl`, `CommandOrControl`, `CmdOrCtrl`, `Super`.
   - Exatamente UMA tecla final, que não é modificador: `A`–`Z`, `0`–`9`, `F1`–`F24`, `Space`, `Tab`, `Enter`, `Backspace`, `Delete`, `Insert`, `Home`, `End`, `PageUp`, `PageDown`, `Up`, `Down`, `Left`, `Right`, ou um destes símbolos: `` ` `` `-` `=` `[` `]` `\` `;` `'` `,` `.` `/`.
   - Exige pelo menos 1 modificador; sem modificador repetido; a tecla é a última parte.
   - Exemplos válidos: `Alt+Space`, `Ctrl+Shift+G`, `CommandOrControl+Alt+K`, `Super+Shift+F12`.
   - Exemplos inválidos: `Space`, `Alt`, `Alt+Shift`, `Alt+Alt+K`, `Alt+Space+K`, `Alt + K`, `''`, `123`, `Alt+Ç`.
3. `normalizeSettings(raw)` → objeto completo e válido:
   - parte de uma cópia de `DEFAULT_SETTINGS`;
   - se `raw` não for objeto simples, retorna os padrões;
   - `botId`: aceita string vazia ou string que passe em `isValidBotId` (importar de `./link`); senão usa o padrão;
   - `shortcut`: aceita se `isValidShortcut`; senão usa o padrão;
   - `launchAtLogin`: aceita apenas boolean; senão usa o padrão;
   - ignora chaves desconhecidas (não aparecem no resultado).
4. `loadSettings(filePath)` → objeto normalizado:
   - se o arquivo não existir, estiver vazio ou com JSON inválido, retorna os padrões sem lançar erro;
   - nunca lança exceção.
5. `saveSettings(filePath, settings)` → objeto normalizado que foi salvo:
   - normaliza antes de salvar;
   - cria a pasta se não existir (`fs.mkdirSync(..., { recursive: true })`);
   - grava de forma atômica: escreve em `<arquivo>.tmp` e depois `fs.renameSync` para o destino;
   - JSON com indentação de 2 espaços, UTF-8.

## Testes em `test/settings.test.js` (node:test + node:assert)
Usar uma pasta temporária criada com `fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-'))` e removê-la no final (`fs.rmSync(..., { recursive: true, force: true })`). Cobrir:
- arquivo inexistente, vazio e com JSON inválido → padrões;
- salvar e carregar de volta → igual;
- salvar cria pastas intermediárias;
- não sobra arquivo `.tmp` depois de salvar;
- valores inválidos por campo (botId com espaço, atalho `Space`, launchAtLogin `"sim"`) → caem no padrão só naquele campo;
- chaves desconhecidas são descartadas;
- `DEFAULT_SETTINGS` não é alterado por `normalizeSettings` (imutabilidade);
- todos os exemplos válidos e inválidos de atalho listados acima.

## Critérios de aceite
- `npm test` passa (testes antigos e novos).
- Sem dependências externas; não importa `electron`.

## O que NÃO fazer
- NÃO alterar `src/main.js`, `src/icon.js`, `src/lib/link.js`, `package.json` nem outros arquivos fora da lista.
- NÃO instalar dependências.
- NÃO fazer commit nem push.
- NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa: arquivos alterados, resumo, testes executados e resultado, dúvidas ou bloqueios.
