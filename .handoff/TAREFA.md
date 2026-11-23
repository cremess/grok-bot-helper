# Tarefa 6 — README do projeto

## Objetivo
Criar o `README.md` na raiz, em português do Brasil, para quem (o próprio Pedro, no futuro) quiser instalar, configurar e usar o app.

## Arquivos envolvidos
- Criar: `README.md`

## Conteúdo (nesta ordem, com títulos `##`)
1. **Título e resumo** (2–3 linhas): app companheiro do Grok Bot para Windows; um atalho global abre uma caixa flutuante e envia o texto para um bot escolhido do Grok Bot.
2. **Como funciona**: o app gera o link `grokbot://app/v1/prompt?id=<bot>&text=<texto>` e o Windows o entrega ao Grok Bot, que pede confirmação ("Adicionar mensagem para Grok?") antes de adicionar a mensagem. Mencionar que existe a opção "Não mostrar novamente" no próprio Grok Bot e o risco: qualquer link `grokbot://` passa a adicionar texto sem perguntar.
3. **Requisitos**: Windows 10/11, Grok Bot instalado, Node.js (versão 26 foi a usada) e npm.
4. **Instalação**: `npm install`. Incluir a observação: se `node_modules/electron/dist/electron.exe` não existir depois do install, rodar `node node_modules/electron/install.js`.
5. **Uso**: `npm start`; o app fica na bandeja (ícone azul). Tabela de teclas: atalho (padrão `Alt+Space`) abre/fecha; `Enter` envia; `Shift+Enter` nova linha; `Esc` ou clicar fora fecha. Limite de 1000 caracteres. Menu da bandeja: Abrir prompt, Configurações…, Sair; clique esquerdo no ícone abre o prompt.
6. **Configurações**: bot de destino (cole o link do bot — `grokbot://app/v1/agent?id=…` ou `https://cursor.com/grok-bot/link/v1/agent?id=…` — ou o ID; vazio = bot padrão), atalho (clique no campo e pressione a combinação; Esc cancela; "Restaurar padrão"), Iniciar com o Windows. Onde ficam salvas: `%APPDATA%\grokbot-assistant\settings.json`.
7. **Solução de problemas**: atalho não abre (o app está rodando? outro programa usa o atalho — aparece um aviso na bandeja; o PowerToys Run usa Alt+Espaço por padrão); a mensagem não chega (Grok Bot instalado? conferir o ID do bot); "Iniciar com o Windows" aponta para a pasta do projeto enquanto não houver instalador.
8. **Desenvolvimento**: `npm test` (o que os testes cobrem: link, configurações, atalho, posição); estrutura de pastas resumida (`src/main.js`, `src/lib/`, `src/prompt/`, `src/settings/`, `test/`); fluxo de trabalho Claude Code + Codex descrito no `AGENTS.md` e pasta `.handoff/`.

## Critérios de aceite
- Tudo correto em relação ao código atual (confira em `src/` e `package.json` antes de escrever; não invente recursos).
- Markdown limpo, sem emojis, sem dados pessoais.

## O que NÃO fazer
- NÃO alterar nenhum outro arquivo.
- NÃO fazer commit nem push. NÃO alterar `AGENTS.md`, `.gitignore` nem `.handoff/HISTORICO.md`.

## Ao terminar
Substitua todo o conteúdo de `.handoff/RESULTADO.md` pelo resultado desta tarefa.
