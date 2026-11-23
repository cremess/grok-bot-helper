# GrokBot Assistant

App companheiro do Grok Bot para Windows.
Um atalho global abre uma caixa de texto flutuante para enviar uma mensagem ao bot escolhido do Grok Bot.

## Como funciona

O app gera o link `grokbot://app/v1/prompt?id=<bot>&text=<texto>`, com o texto codificado para uso na URL. O Windows entrega esse link ao Grok Bot. Quando nenhum bot está configurado, o parâmetro `id` é omitido e a mensagem vai para o bot padrão.

Antes de adicionar a mensagem, o Grok Bot pede confirmação: "Adicionar mensagem para Grok?". A opção "Não mostrar novamente" fica no próprio Grok Bot. Ao ativá-la, qualquer link `grokbot://` passa a adicionar texto sem perguntar; considere esse risco antes de desativar a confirmação.

## Instalar (para quem só quer usar)

1. Rode `GrokBot-Assistant-Setup-<versão>.exe`. A instalação é de um clique, só para o seu usuário, sem pedir administrador.
2. Como o instalador não é assinado digitalmente, o Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informações** e depois em **Executar assim mesmo**.
3. Na primeira abertura aparece a tela de boas-vindas com a lista dos seus bots do Grok Bot (o mais usado já vem marcado). Clique em **Salvar e começar**.
4. Pronto: use o atalho indicado (padrão `Alt+Space`; se estiver ocupado, o app escolhe outro e avisa) em qualquer lugar. O app inicia junto com o Windows e fica na bandeja.

Requisitos: Windows 10 ou 11 (64 bits) e o Grok Bot instalado e aberto pelo menos uma vez. Para desinstalar, use **Configurações do Windows > Aplicativos**.

## Gerar o instalador

```powershell
npm run dist
```

O arquivo sai em `dist/GrokBot-Assistant-Setup-<versão>.exe`. Para refazer os ícones a partir dos SVGs, rode `npm run icons` antes.

## Requisitos para desenvolvimento

- Windows 10 ou 11.
- Grok Bot instalado.
- Node.js e npm. A versão do Node.js usada no projeto foi a 26.

## Instalação para desenvolvimento

Na pasta do projeto, execute:

```powershell
npm install
```

Se `node_modules/electron/dist/electron.exe` não existir depois da instalação, execute:

```powershell
node node_modules/electron/install.js
```

## Uso

Na pasta do projeto, execute:

```powershell
npm start
```

O app fica na bandeja do sistema, com um ícone azul. Abra o prompt, digite uma mensagem de até 1000 caracteres e envie.

| Tecla ou ação | Resultado |
| --- | --- |
| Atalho global (padrão: `Alt+Space`) | Abre ou fecha o prompt. |
| `Enter` | Envia a mensagem ao Grok Bot. |
| `Shift+Enter` | Insere uma nova linha. |
| `Esc` ou clique fora da caixa | Fecha o prompt. |

O clique esquerdo no ícone da bandeja abre o prompt. O menu da bandeja oferece **Abrir prompt**, **Configurações…** e **Sair**. Use **Sair** para encerrar o app.

## Configurações

Abra **Configurações…** pelo menu da bandeja e ajuste:

- **Bot de destino:** cole o link do bot (`grokbot://app/v1/agent?id=…` ou `https://cursor.com/grok-bot/link/v1/agent?id=…`) ou apenas o ID. Deixe vazio para usar o bot padrão.
- **Atalho:** clique no campo e pressione a combinação desejada, incluindo um modificador como `Alt` ou `Ctrl`. `Esc` cancela a captura. **Restaurar padrão** seleciona `Alt+Space` novamente.
- **Iniciar com o Windows:** marque para abrir o app automaticamente ao entrar no Windows.

Clique em **Salvar** para aplicar as alterações. As configurações ficam em `%APPDATA%\grokbot-assistant\settings.json`.

## Solução de problemas

- **O atalho não abre o prompt:** confira se o app está rodando e se o ícone azul aparece na bandeja. Outro programa pode estar usando a combinação; quando o registro do atalho falha, o app exibe um aviso na bandeja. O PowerToys Run usa `Alt+Espaço` por padrão. Escolha outra combinação nas configurações se houver conflito.
- **A mensagem não chega:** confira se o Grok Bot está instalado e se o ID do bot está correto nas configurações. Verifique também a confirmação exibida pelo próprio Grok Bot.
- **Iniciar com o Windows:** enquanto não houver instalador, a inicialização aponta para o executável do Electron e a pasta do projeto. Mantenha essa pasta e suas dependências no local configurado.

## Desenvolvimento

Execute os testes com o runner nativo do Node.js:

```powershell
npm test
```

Os testes cobrem a montagem do link, a validação do texto e do bot, a leitura e gravação das configurações, a conversão e validação de atalhos e o cálculo da posição do prompt. A abertura das janelas e o registro do atalho global são verificados manualmente.

| Caminho | Conteúdo |
| --- | --- |
| `src/main.js` | Processo principal do Electron: bandeja, janelas, atalho global e integração com o Grok Bot. |
| `src/lib/` | Lógica de links, configurações, atalhos e posição da janela. |
| `src/prompt/` | Interface da caixa de texto flutuante. |
| `src/settings/` | Interface de configurações. |
| `test/` | Testes automatizados. |

O fluxo de trabalho entre Claude Code e Codex está descrito em `AGENTS.md`. Na pasta `.handoff/`, o Claude Code escreve `TAREFA.md`, o Codex registra a execução em `RESULTADO.md` e o Claude Code mantém `HISTORICO.md` com o resultado das revisões.
