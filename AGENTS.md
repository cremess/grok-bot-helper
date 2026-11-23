# AGENTS.md

## Projeto
App companheiro do Grok Bot para Windows: um atalho global (padrão Alt+Espaço) abre uma caixa de texto flutuante; ao enviar, o texto vai para o Grok Bot pelo link `grokbot://app/v1/prompt?text=<texto>` (máximo de 1000 caracteres). O app roda na bandeja do sistema.
Stack: Electron + JavaScript (CommonJS), sem framework de UI. Testes com o runner nativo do Node (`node --test`), cobrindo a lógica pura (montagem do link, validação do texto, configurações); atalho e janela são testados manualmente.

- Rodar: `npm start`
- Testar: `npm test`

## Papéis
- **Claude Code (orquestrador):** planeja, divide o trabalho em tarefas pequenas, escreve as tarefas, aciona o Codex, revisa diffs, roda testes e decide se a tarefa foi aceita.
- **Codex (executor):** implementa exatamente a tarefa recebida, sem ampliar o escopo, e registra o que fez.

## Protocolo de troca (pasta .handoff/)
- `.handoff/TAREFA.md`: escrito pelo Claude Code. Contém: objetivo, arquivos envolvidos, critérios de aceite e o que NÃO fazer.
- `.handoff/RESULTADO.md`: escrito pelo Codex ao final de cada tarefa. Contém: arquivos alterados, resumo das mudanças, testes executados e resultado, dúvidas ou bloqueios.
- `.handoff/HISTORICO.md`: o Claude Code acrescenta uma linha por rodada (data, tarefa, aceita/devolvida, motivo).

## Regras para todos
- Não alterar arquivos fora do escopo da tarefa.
- Não apagar arquivos sem autorização explícita do Pedro.
- Não fazer commit, push ou deploy sem autorização do Pedro. O Pedro autorizou o Claude Code a commitar e dar push de cada tarefa aceita no repositório privado do GitHub; o Codex nunca faz commit nem push.
- Não instalar dependências novas sem registrar o motivo em RESULTADO.md.
- Nunca gravar senhas, tokens ou chaves em arquivos do projeto.
- Na dúvida, parar e registrar a pergunta em RESULTADO.md em vez de supor.
- Escrever tarefas, resultados e comentários em português do Brasil.