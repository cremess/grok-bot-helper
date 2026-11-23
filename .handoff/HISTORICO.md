# Histórico de rodadas

| Data | Tarefa | Resultado | Motivo |
|---|---|---|---|
| 2026-11-23 | Preparação | aceita (Claude) | Codex CLI 0.171.0, Node 26.13.1 e gh 2.105.0 instalados; git iniciado; AGENTS.md preenchido; link `grokbot://app/v1/prompt?text=` validado (Grok Bot pede confirmação antes de adicionar a mensagem). |
| 2026-11-23 | T1: esqueleto Electron + bandeja | aceita (1ª tentativa) | Código revisado; npm test ok; app sobe na bandeja e a 2ª instância fecha. Obs.: npm não rodou o postinstall do Electron, binário baixado com node node_modules/electron/install.js. |
| 2026-11-23 | T2: montagem do link | aceita (1ª tentativa) | validateText/parseBotId/buildPromptLink revisados; 9 testes passando, incluindo limites, emojis, caracteres especiais e host falso. |
| 2026-11-23 | T3: configurações salvas | aceita (1ª tentativa) + ajuste do Claude | 18 testes passando. Ajuste de 1 linha: loadSettings remove BOM do UTF-8 (arquivo editado no Bloco de Notas). |
| 2026-11-23 | T4+T5: janela do prompt + atalho global | aceita (1ª tentativa) | 22 testes ok; revisão de segurança ok (contextIsolation, sandbox, CSP); Alt+Espaço abre a janela e Enter leva o texto à confirmação do Grok Bot (testado pelo Pedro). |
| 2026-11-23 | T6+T7: configurações + menu da bandeja | aceita (1ª tentativa) | 31 testes ok; diff revisado (gravação de atalho desliga/religa o global, restaura atalho antigo em caso de falha); Pedro testou troca de bot e de atalho. |
| 2026-11-23 | T8: README | aceita (1ª tentativa) + ajuste do Claude | Conteúdo conferido com o código; ajuste: título com # e descrição do AGENTS.md atualizada com o bot de destino. |
| 2026-11-23 | T9: leitura da lista de bots + botName | aceita (1ª tentativa) | 46 testes ok; listBots validado nos dados reais do Grok Bot (7 bots, ordenados por uso). |
| 2026-11-23 | T10: ícone de verdade | aceita (1ª tentativa) | 47 testes ok; ícones gerados pelo Claude com npm run icons (PNG 16/32/256 + ICO multicamada) e conferidos visualmente. |
| 2026-11-23 | T11: visual novo + seletor de bots (1ª tentativa) | devolvida | Lógica e segurança ok (50 testes), mas captura visual mostrou: contorno azul no campo do prompt, rolagem dupla com barras padrão, seleção fora de vista, layout do atalho solto. |
| 2026-11-23 | T11: visual novo + seletor de bots (2ª tentativa) | aceita | Capturas conferidas: prompt sem contorno, configurações sem rolagem dupla, seleção visível com check, atalho e interruptor alinhados. 50 testes ok. |
| 2026-11-23 | T12: abrir configurações pelo prompt | aceita (1ª tentativa) | Testado por script: engrenagem abre configurações, esconde o prompt preservando o texto; Ctrl+, também abre. 50 testes ok. |
| 2026-11-23 | T13: instalador .exe + primeira execução | aceita (1ª tentativa) + ajuste do Claude | electron-builder 26.18.1 (NSIS um clique, por usuário). Primeira execução simulada em PC novo com e sem Grok Bot (boas-vindas, bot mais usado pré-selecionado, balão). App empacotado testado. Ajustes do Claude: app instalado regrava a inicialização com o Windows; README com instalação para amigos. |
| 2026-11-23 | T14: leitura da conversa + markdown + afterSend | aceita (1ª tentativa) | 72 testes ok; validado nos dados reais (última resposta do Grok achada, bot padrão resolvido via last-agent); link javascript: vira texto. |
