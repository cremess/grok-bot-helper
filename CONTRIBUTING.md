# Como contribuir

## Visão geral

O GrokBot Assistant é um app para Windows que fica na bandeja e abre um prompt por atalho global.
O envio ao bot escolhido usa o deep link `grokbot://app/v1/prompt`, com mensagens de até 1000 caracteres.
A lista de bots e as conversas são obtidas por acesso somente de leitura aos arquivos locais do Grok Bot.
Esse formato é interno e pode mudar em atualizações do Grok Bot.

## Preparar o ambiente

Você precisa de Windows 10 ou 11, Node.js 22 ou superior, Git e Grok Bot instalado e aberto pelo menos uma vez.
Clone o repositório usando a URL fornecida pelo mantenedor:

```powershell
git clone <URL-do-repositorio>
cd grokbot-assistant
npm install
npm start
```

Use em `cd` o nome da pasta criada pelo clone. Se o binário `node_modules/electron/dist/electron.exe` não vier na instalação, execute `node node_modules/electron/install.js` antes de iniciar.

## Comandos

- `npm start`: inicia o app pelo Electron.
- `npm test`: executa os testes com o runner nativo do Node.js.
- `npm run check`: verifica a sintaxe dos arquivos JavaScript em `src/`, `scripts/` e `test/`.
- `npm run icons`: gera os ícones PNG e ICO a partir dos SVGs em `assets/`.
- `npm run dist`: gera o instalador NSIS para Windows de 64 bits em `dist/`.

## Estrutura de pastas

| Caminho | Conteúdo |
| --- | --- |
| `src/main.js` | Processo principal: janelas, bandeja, atalhos e integração com o Grok Bot. |
| `src/lib/` | Lógica testável, incluindo funções puras e leitura e gravação de arquivos. |
| `src/prompt/` | Interface do prompt e da conversa. |
| `src/settings/` | Interface de configurações e boas-vindas. |
| `src/ui/` | Tokens visuais e componente BotPicker compartilhado. |
| `assets/` | SVGs e ícones do app. |
| `scripts/` | Geração de ícones e verificação de sintaxe. |
| `test/` | Testes automatizados com `node:test`. |
| `.handoff/` | Registro do fluxo Claude Code + Codex usado pelo mantenedor; contribuidores não precisam usar. |

## Regras do código

- Use CommonJS. Coloque lógica nova de preferência em `src/lib/`, com testes em `test/` usando `node:test`.
- Preserve a segurança das janelas: `contextIsolation: true`, `sandbox: true` e `nodeIntegration: false`. A CSP deve permanecer sem `unsafe-inline`.
- **Nunca** use `innerHTML` com conteúdo externo. Nomes de bots e mensagens vêm de arquivos do Grok Bot; construa os elementos com APIs do DOM e use `textContent` para texto.
- Mantenha deep links e chamadas a `shell.openExternal` somente no processo principal. Valide os IDs dos bots antes de montar deep links e restrinja os protocolos dos links externos, como no código atual.
- Não inclua dados pessoais, tokens ou caminhos do seu computador no código ou nos testes. Use dados fictícios e pastas temporárias nos testes de arquivos.
- Escreva textos de interface e comentários em português do Brasil.
- Discuta novas dependências no PR antes de adicioná-las.

## Testar sem gastar tokens do Grok Bot

Para testar a interface e simular envio e resposta, use um script executado pelo Electron que chame `app.setPath('appData', <pasta temporária>)` **antes** de carregar `src/main.js`. O processo principal deriva desse caminho tanto os dados do Assistant quanto a pasta `Grok Bot/sand-client-persistence`.

Copie para essa pasta temporária somente os arquivos necessários do Grok Bot: a lista de bots, a conversa do bot escolhido e, se usar o bot padrão, a seleção do último bot. Prefira cópias com conteúdo fictício, seguindo os formatos exercitados em `test/roster.test.js` e `test/transcript.test.js`.

Antes de carregar o processo principal, intercepte `shell.openExternal` para registrar o link e simular uma conclusão bem-sucedida, sem abrir o Grok Bot. Para simular uma resposta, atualize apenas a cópia temporária da conversa com uma mensagem do bot e um horário posterior ao envio; o app consulta esse arquivo periodicamente. Assim é possível testar o fluxo sem enviar mensagens reais nem alterar os arquivos do Grok Bot real. Esse script é um recurso de teste local e não está incluído no repositório.

## Fluxo de contribuição

1. Crie uma branch a partir da `main`, com prefixo `feat/` ou `fix/`.
2. Faça commits pequenos, com mensagens no imperativo em português, como “Adicione validação do texto”.
3. Execute `npm run check` e `npm test` e faça o teste manual pertinente no Windows.
4. Abra um PR para `main`, preencha o modelo e anexe uma captura de tela se alterou a interface.
5. Aguarde o CI passar e peça revisão do Pedro.

## Reportar problemas

Abra uma issue com os passos para reproduzir, o resultado esperado, o que aconteceu e as versões do Windows e do Grok Bot.
