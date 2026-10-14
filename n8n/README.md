# Workflows do n8n

Este diretório guarda os exports dos workflows que o painel depende, para que o
contrato fique versionado junto com o código que o consome. O n8n em si continua
fora deste repositório.

Nenhum arquivo aqui contém segredo. As credenciais são referenciadas por nome e
precisam existir no n8n antes da importação.

## `omnichannel/` - harness local inativo do Lote 2

O diretório `omnichannel/` é diferente do workflow ativo do Analista. Ele
contém somente um mestre e subworkflows simulados, todos com `active: false`,
sem credenciais, URLs ou nós de rede. Esses arquivos não foram importados nem
executados no n8n e não devem ser ativados. O contrato e os limites estão em
`omnichannel/README.md`.

## `miranda-crm/` - mapa inativo do espelho para o Frappe

Contém o contrato de onde os seis workflows atuais da Miranda deverão emitir
eventos para o CRM e um sink totalmente simulado. O sink está inativo, não tem
URL, credencial ou nó de rede e sempre retorna `shadow_only`. Os workflows
privados fornecidos serviram apenas para confirmar nomes e ordem funcional;
nenhum valor privado ou export bruto foi copiado.

## `miranda-v2-candidate/` - candidatos funcionais inativos da Miranda

Contém seis workflows candidatos gerados a partir dos seis exports privados da
Miranda, sempre por leitura e sanitização. Eles consolidam 16 blocos técnicos
em seis canvases operacionais: entrada omnichannel, atendimento IA, agenda,
follow-ups/lembretes, integração CRM e saída segura. Diferente das cópias de
revisão, estes arquivos reorganizam de fato o fluxo.

Os candidatos persistem uma mensagem por evento antes de pausa ou trabalho
caro, resolvem o tenant pela conta confiável, espelham Lead/Deal/timeline no
Frappe, centralizam envio, tratam resultado incerto sem retry, recebem comandos
de pausa/handoff/agendamento/presença e conservam atribuição de anúncio. O
adaptador Meta percorre todos os eventos de um webhook agrupado, sem escolher
apenas o primeiro.

Todos os arquivos versionados estão `active: false`; não contêm credenciais nem
destinos literais. Cópias privadas hidratadas desses mesmos seis canvases foram
publicadas somente no HML, com canais e schedules desligados, providers
apontados para `.invalid` e `delivery_mode = observe_only`.
O gerador é
`npm run build:miranda:v2:candidates -- --source <ZIP_PRIVADO>` e os testes
estruturais/comportamentais ficam em
`tests/miranda-v2-candidate-workflows.test.ts`. Credenciais, nodes e efeitos
reais ainda exigem integração e autorização próprias.

| Workflow HML completo | ID | Nodes |
| --- | --- | ---: |
| Entrada Omnichannel | `d-HaAJRDGtlnBoKX` | 83 |
| Atendimento IA | `vYKPApDzqyBUx3Xo` | 74 |
| Agenda | `ybR0Ijc0HDRUNBsZ` | 38 |
| Follow-ups e Lembretes | `kh_MnrJlDH3KmyzI` | 63 |
| Integração CRM | `eTucz9iRsfs28sd1` | 22 |
| Saída Segura | `yX2ab8yzzDppCj-P` | 31 |

O gateway do Agent Test é `AcZ9xStPyoP4NKIr`, com o nome
`LEXIA HML - MIRANDA - 00 GATEWAY AGENT TEST`. Ele chama somente os seis IDs
HML acima.

Uma execução sintética direta da Entrada completa terminou com
`status = suppressed`, `reason = observe_only` e
`provider_send_attempted = false`. Os nodes de envio Z-API, Meta e adaptador
externo não foram executados. Os dados do ensaio foram removidos do Frappe,
Supabase e Redis. Os seis workflows operacionais originais da Miranda não foram
editados.

O Agent Test também executa `full_agent_virtual`: usa o buffer, contexto,
Supabase/Redis descartáveis e o cérebro HML, mas mantém Calendar desabilitado e
suprime toda saída antes do provedor. O idioma da mensagem mais recente do lead
é resolvido entre português, inglês e espanhol, passado como obrigatório ao
redator e conferido novamente antes do plano de entrega. Pedido explícito de
idioma na mensagem mais recente prevalece mesmo quando a frase está escrita no
idioma anterior; mensagem curta ou ambígua preserva o idioma anterior. Uma
resposta incompatível termina em `response_language_mismatch` e não produz
envio. A sequência português -> inglês -> espanhol passou na mesma conversa,
sempre com `provider_send_attempted = false`.

O caso misto `Gostaria de ser atendido em espanol` também é coberto. O cérebro
já entendia o pedido, e agora tanto o briefing quanto o gate reconhecem a troca,
persistem espanhol para os turnos seguintes e não voltam ao idioma anterior em
mensagens ambíguas. O reteste HML passou na execução `133270`, ainda em
`observe_only` e sem provider.

## `miranda-v2-lab-runtime/` - seis workflows executáveis do laboratório

Contém versões compactas e legíveis dos mesmos seis papéis, apenas para o
Agent Test isolado. Cada arquivo possui nota explicativa, gatilho interno,
nodes Code determinísticos e chamadas `Execute Workflow` por ID. Não há HTTP
Request, Redis, Postgres, modelo, Schedule Trigger, credencial ou destino
externo nos seis filhos. O único webhook continua no gateway autenticado.

Em 10/10/2026, cópias remotas desses seis runtimes passaram pelos seis alvos do
gateway. Depois de os mesmos contratos serem incorporados às rotas de
laboratório dos workflows HML completos, o gateway foi migrado para os seis
IDs da tabela acima. Os seis cenários publicados retornaram
`provider_send_attempted = false`, e uma tentativa com ambiente diferente de
`isolated_test` falhou fechada. As cópias compactas remotas foram então
despublicadas e arquivadas. Os arquivos deste diretório permanecem versionados
como fixtures e referência de regressão, não como runtime remoto atual.

`npm run build:miranda:v2:lab-runtime` regenera os seis arquivos versionados.
O deployment remoto sanitizado é montado fora do Git por
`npm run build:miranda:v2:lab-deployment -- --export-dir <DIRETORIO_DOS_EXPORTS> --output <DIRETORIO>`.
Os exports servem apenas para preservar identidade/metadados remotos e a
credencial de autenticação já existente no gateway; os artefatos gerados não
são versionados.

`npm run build:miranda:v2:staging` gera, fora do Git, o deployment dos seis
workflows completos. Ele exige credenciais de laboratório já criadas, valida
todos os nodes de rede/dados/modelo e falha se algum trigger real ou destino de
provedor estiver habilitado.

## `omnichannel-test/` - runtime sintético local

Contém o mestre e os subworkflows executáveis somente com store, Redis, mídia,
cérebro, tools e provedor falsos. Ele cobre isolamento, pausas concorrentes,
deduplicação, reprocessamento e entrega parcial sem conexão externa.

O gerador `npm run build:miranda:v2:review` usa esse runtime junto com seis
cópias sanitizadas e inativas dos workflows fornecidos da Miranda. Em cada
cópia, todos os nós herdados ficam desativados; somente o ramo autenticado
`[LEXIA TEST]` pode responder a uma solicitação sintética da área de testes do
Frappe. Importar ou ativar esses arquivos fora de uma instância n8n isolada não
é autorizado.

Esse pacote de revisão não é a implementação corrigida. Ele existe para
inspeção e teste sintético; os candidatos funcionais estão em
`miranda-v2-candidate/`.

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
