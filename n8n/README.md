# Workflows do n8n

Este diretório guarda os exports dos workflows que o painel depende, para que o
contrato fique versionado junto com o código que o consome. O n8n em si continua
fora deste repositório.

Nenhum arquivo aqui contém segredo. As credenciais são referenciadas por nome e
precisam existir no n8n antes da importação.

## `analista-chat.json` — Analista Lexia (chat)

Orquestra a pergunta que o usuário faz no painel. O painel não fala com a OpenAI
nesse fluxo: ele despacha para o n8n e fica em polling até o callback chegar.

### Como o fluxo se encaixa no código

1. `POST /api/analista/chat` grava a pergunta, cria a execução `iniciada` e faz
   um `POST` assinado em `N8N_ANALYST_WEBHOOK_URL` (`lib/analyst/n8n.ts`,
   `queueAnalystQuestion`). O webhook precisa responder 2xx em até 12 segundos,
   senão a execução já nasce com erro.
2. O nó `Recebe pergunta` responde na hora (`responseMode: onReceived`) e o resto
   do workflow continua em background.
3. `Prepara contexto` normaliza o payload e monta o system prompt com nome do
   cliente, período, canal e histórico. É o equivalente n8n do
   `buildInstructions` que existia em `lib/analyst/chat.ts`.
4. O `Analista Lexia` (AI Agent) decide quais ferramentas chamar. Cada ferramenta
   é um `HTTP Request Tool` que sempre bate no mesmo endpoint,
   `POST /api/analista/n8n/tool`, mudando só o campo `tool` e os `arguments`.
   O `execution_id` nunca vem do modelo: é lido do payload do webhook por
   expressão. É isso que impede o modelo de consultar outro cliente ou outro
   período.
5. `Monta retorno` extrai a resposta e as fontes dos `intermediateSteps` e
   `Devolve para a Lexia` faz `POST /api/analista/n8n/callback`.
6. Se o agente falhar, a saída de erro cai em `Monta erro`, que manda
   `status: "failed"` pelo mesmo callback. Sem isso a pergunta ficaria girando na
   tela até expirar em 10 minutos.

### Pré-requisitos antes de importar

Duas credenciais no n8n, com estes nomes exatos (a importação liga pelo nome):

| Nome                          | Tipo               | Conteúdo                                   |
| ----------------------------- | ------------------ | ------------------------------------------ |
| `Lexia Analista Header Auth`  | Header Auth        | Name `Authorization`, Value `Bearer <N8N_ANALYST_WEBHOOK_SECRET>` |
| `OpenAi account`              | OpenAI             | A chave da OpenAI                          |

A mesma credencial Header Auth é usada nas três pontas: o n8n a exige para
aceitar o webhook, e a envia ao chamar `/tool` e `/callback`. O segredo precisa
ter no mínimo 32 caracteres.

### Variáveis de ambiente na Vercel

| Variável                     | Valor                                              |
| ---------------------------- | -------------------------------------------------- |
| `LEXIA_APP_URL`              | `https://app.uselexia.app` (precisa ser HTTPS)      |
| `N8N_ANALYST_WEBHOOK_URL`    | A **Production URL** do nó `Recebe pergunta`        |
| `N8N_ANALYST_WEBHOOK_SECRET` | O mesmo segredo da credencial Header Auth           |

A URL de teste (`/webhook-test/...`) só funciona com o editor aberto. Usar a de
produção e ativar o workflow.

### Ferramentas expostas

Todas são somente leitura e o escopo é reconstruído no servidor a partir da
execução. Os nomes precisam bater com `analystN8nToolNames` em
`lib/analyst/n8n.ts`.

| Ferramenta          | Argumentos                | Para quê                                  |
| ------------------- | ------------------------- | ----------------------------------------- |
| `obter_desempenho`  | nenhum                    | Métricas exatas do período + `por_canal`  |
| `analisar_objecoes` | `limite` (1–12)           | Objeções agregadas (com `por_canal`) + cobertura |
| `analisar_qualidade`| `limite` (1–12)           | Pontos fortes e melhorias do agente       |
| `buscar_conversas`  | `consulta`, `limite`      | Exemplos reais por termo                  |
| `abrir_conversa`    | `referencia_conversa`     | Histórico de uma conversa já referenciada |
| `resumir_feedbacks` | nenhum                    | Feedbacks do período                      |
| `listar_conversas`  | `offset`, `limit` (1–4)   | Leitura bruta paginada                    |
| `obter_cobertura`   | nenhum                    | Quanto da base já foi classificado        |

### Limites que valem lembrar

- `maxIterations: 8` no agente e "no máximo 6 chamadas de ferramenta" no prompt.
  Se a resposta vier incompleta, o teto é aqui.
- A execução expira em 10 minutos (`analystExecutionTimeoutMs`).
- O painel limita 12 perguntas por usuário a cada 5 minutos.
- A resposta é truncada em 20 000 caracteres no callback.
- `sources` depende de `returnIntermediateSteps`. Se a versão do n8n não
  devolver esse campo, a resposta continua funcionando, só sem as fontes
  anexadas.

### Ajustar o tom das respostas

O system prompt inteiro vive no nó `Prepara contexto`, e `prepara-contexto.js`
guarda exatamente o mesmo conteúdo para facilitar edição e copy-paste. Para
mudar o tom sem reimportar o workflow, edita o bloco `linhas` nesse nó.

Três armadilhas já encontradas: pedir para "diferenciar fatos, interpretação e
recomendação" faz o modelo criar títulos literais com esses nomes; sem uma
instrução explícita de tamanho ele devolve todos os números que a ferramenta
retornou, viram listas e a resposta deixa de parecer uma conversa; e proibir
"menu de opções" não impede o modelo de pedir permissão antes de consultar — ele
fica perguntando "quer que eu execute?" em loop até existir uma linha explícita
proibindo isso.

Quando uma ferramenta ganhar um recorte novo, revisar o bloco
`O QUE VOCÊ PODE AFIRMAR`: ele lista o que o analista **não** consegue agrupar, e
uma linha desatualizada aí faz o modelo recusar uma pergunta que agora ele sabe
responder. Foi o que aconteceu com a quebra por canal.

### Modelo

`gpt-5-mini` com `temperature: 1`. Modelos da família gpt-5 rejeitam qualquer
outro valor de temperatura, e o padrão do nó do n8n é 0.7 — por isso o campo
está explícito.
