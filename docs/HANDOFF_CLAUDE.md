# Handoff para Claude Code

> Estado em 10/10/2026. Este documento descreve o repositorio local e os
> ensaios descartaveis ja autorizados. Ele nao concede nova autorizacao para
> SQL, conexoes, importacao/ativacao de workflows, publicacao ou producao.

## 1. Leitura obrigatoria

Leia os arquivos abaixo na ordem indicada. Nao trate este handoff como
substituto das fontes canonicas.

1. `CLAUDE.md`: guardrails curtos para toda sessao Claude Code.
2. `AGENTS.md`: regras locais de engenharia e documentacao.
3. `Agent.MD`: mapa completo da plataforma, banco, rotas, integracoes e riscos.
4. `PLAN.MD`: prioridades, criterios de aceite e fases ainda pendentes.
5. `docs/LOTE_1_AUTORIZACAO_WORKFLOWS.md`: autorizacao e operacao segura do
   primeiro lote.
6. `docs/LOTE_2_WORKFLOW_MESTRE_OMNICHANNEL.md`: especificacao detalhada e
   limites aprovados do segundo lote.
7. `contracts/omnichannel/v1/README.md` e os JSON Schemas provisorios.
8. `lib/omnichannel/`: implementacao pura e local dos contratos.
9. `tests/omnichannel-*.test.ts` e `tests/fixtures/omnichannel/`.
10. `n8n/omnichannel/README.md` e os exports `*.inactive.json` simulados.
11. `docs/LOTE_2_REFERENCIA_FLUXO_ATUAL_MIRANDA.md`: referencia funcional do
    fluxo atual, lacunas confirmadas e plano do buffer.
12. `docs/LOTE_2_REVISAO_BANCO.md`: migration, checks, operacoes, ensaio
    descartavel e rollback do Lote 2.
13. `n8n/omnichannel-test/README.md`: mestre executavel de teste, nos por
    etapa e o que ainda depende de integracao real.
14. `n8n/miranda-v2-candidate/README.md`: referência detalhada dos seis papéis.
15. `n8n/miranda-v2-lab-runtime/`,
    `scripts/build-miranda-v2-lab-deployment.mjs` e
    `tests/miranda-v2-lab-runtime.test.ts`: seis filhos sintéticos publicados
    no laboratório e o deployment sanitizado.

Antes de alterar uma rota Next.js, leia a documentacao da versao instalada em
`node_modules/next/dist/docs/`. Este projeto usa Next.js 16, nao pressupostos de
versoes anteriores.

## 2. Snapshot Git

Repositorio conferido:
`/Users/arthurpimenta/Developer/lexia-crm`.

| Item | Estado |
| --- | --- |
| Branch atual | `codex/lote-2-workflow-mestre-omnichannel` |
| HEAD | `4bba3d425992af2308c6edce0e1214c40902fe35` |
| `main` | `8e13d2b977f068afbe4452aafcd7195afb102179` |
| Push/merge/deploy | nao executados |
| Ref invalido | `refs/heads/codex/lote-1-autorizacao-workflows 2`, preservar |

O ref invalido pode quebrar comandos que enumeram todas as referencias, como
`git log --all`. Use referencias direcionadas e nao remova, renomeie, repare ou
reescreva esse ref sem decisao especifica.

O worktree continua deliberadamente sem commit. O estado atual inclui:

```text
 M Agent.MD
 M CLAUDE.md
 M PLAN.MD
 M n8n/README.md
 M package.json
?? contracts/
?? docs/HANDOFF_CLAUDE.md
?? docs/LOTE_2_MIRANDA_REVIEW_PACKAGE.md
?? docs/LOTE_2_REFERENCIA_FLUXO_ATUAL_MIRANDA.md
?? docs/LOTE_2_REVISAO_BANCO.md
?? docs/LOTE_2_WORKFLOW_MESTRE_OMNICHANNEL.md
?? lib/omnichannel/
?? n8n/miranda-crm/
?? n8n/miranda-v2-candidate/
?? n8n/omnichannel-test/
?? n8n/omnichannel/
?? scripts/ e supabase/ do Lote 2
?? tests/fixtures/
?? tests/lote2-*.test.ts, tests/miranda-*.test.ts e tests/omnichannel-*.test.ts
```

Nao descarte, restaure ou inclua seletivamente os demais arquivos sem primeiro
entender o Lote 1 e o Lote 2. Nenhum comando Git mutavel foi executado nesta
passagem alem das edicoes locais; nao houve commit, push, merge ou reescrita de
refs.

## 3. Objetivo do projeto

Lexia CRM e a plataforma de operacao de agentes de atendimento da Lexia AI.
Ela oferece dois paineis autenticados:

- administracao global Lexia em `/admin`;
- operacao isolada por cliente em `/app`.

O produto centraliza autenticacao, clientes, conversas, metricas, testes,
feedbacks, handoffs, pausas e auditoria. O objetivo do Lote 2 e substituir
troncos omnichannel duplicados por um mestre reutilizavel e orientado a
eventos, sem incorporar os cerebros privados ou suas tools.

Regra de acesso aprovada: cada usuario cliente possui um unico vinculo e
acessa somente a propria empresa. O admin Lexia ativo possui leitura global e
administracao autorizada. Novas operacoes exigem empresa ativa; contencao e
finalizacao tardia seguem as excecoes estreitas do Lote 1.

## 4. Arquitetura atual da plataforma

### 4.1 Aplicacao central

O repositorio contem uma aplicacao Next.js com Server Actions e APIs. O
Supabase central e a fonte de verdade da plataforma para:

- Auth, perfis e empresas;
- configuracao publica e privada de workflows;
- contactos e mensagens omnichannel;
- sessoes e execucoes de teste;
- feedbacks, handoffs, ajustes e dados do Analista;
- no alvo do Lote 2, configuracao e estado operacional duravel do omnichannel.

Chamadas com `service_role` sao exclusivamente server-side e precisam validar
papel, tenant, recurso, sessao e origem antes de qualquer efeito. A UI nunca
deve receber destinos privados, service roles ou credenciais de integracao.

### 4.2 Operacao atual fora do repositorio

Os workflows omnichannel publicados recebem eventos dos canais, persistem
contactos e mensagens no central, chamam cerebros e tools e entregam respostas.
Eles nao estao versionados aqui. O estado legado de buffer/contexto/pausa vive
em Redis por cliente e possui semantica menos expressiva que o desenho v2.

O frontend atual ainda le algumas metricas de agendamento em Supabases
externos, somente no servidor. Isso e diferente do limite arquitetural do
cerebro: a plataforma nao deve acessar Supabase privado do cerebro nem Google
Agenda para executar atendimento ou tools.

### 4.3 Miranda

- Conversas e operacao da plataforma ficam no Supabase central.
- Metricas atuais de agendamento sao lidas do Supabase dedicado da Miranda,
  na tabela `agendamentos_miranda_skin`, por integracao server-side agregada.
- O cerebro, sua memoria, prompts privados, Google Agenda e tools permanecem
  fora da plataforma central.
- No Lote 2, um resultado real da tool do cerebro produz evento de dominio
  atestado; o mestre nao consulta Google Agenda nem o banco privado.
- A confirmacao do agendamento cria bloqueio ate o termino previsto. A regra
  especial completa esta na secao 7.

### 4.4 Detail By Cordeiro

- Conversas e operacao da plataforma ficam no Supabase central.
- Metricas atuais de agendamento sao lidas do Supabase dedicado da Detail, na
  tabela `marcacoes`, com filtro do tenant esperado.
- Cerebro, Supabase privado, prompts e tools continuam separados do mestre e
  nao concedem acesso direto a plataforma.
- O contrato v2 deve permitir Detail sem copiar o tronco inteiro da Miranda;
  diferencas ficam em configuracao, adaptador, capacidades e workflow privado.

Nao copie registros, credenciais, URLs privadas ou exports brutos desses
clientes para codigo, testes ou documentacao.

## 5. Arquitetura alvo do Lote 2

Fluxo logico aprovado:

```text
provedor -> adaptador autenticado -> ingress/dedupe/persistencia
         -> comandos de estado -> contexto operacional
         -> cerebro privado -> propostas/eventos de dominio
         -> gate por acao -> adaptador autorizado -> provedor
```

O Supabase central guarda configuracao nao secreta e estado operacional
duravel. O Redis v2 e compartilhado dentro do ambiente, com isolamento por:

```text
environment + cliente_slug + channel + account_ref + conversation_ref
```

O identificador externo nao entra em claro na chave Redis; o desenho usa hash
HMAC por ambiente. Redis acelera buffer, leases, fencing, dedupe e projecao,
mas nunca e a unica copia de bloqueio, handoff, acao ou evento auditavel. Falha
de projecao deve bloquear envio e pedir reprojecao, nao liberar automacao.

## 6. Persistencia, contexto e efeitos

### 6.1 Toda mensagem e registrada

Toda mensagem valida deve ser deduplicada e persistida, inclusive se a
conversa estiver pausada, em handoff ou bloqueada por agendamento. Mensagem do
lead durante pausa entra como pendencia/contexto; ela nao chama o cerebro nem
desaparece.

Uma intervencao humana deve ser identificada, persistida e aplicar/renovar seu
bloqueio antes de qualquer trabalho caro: download, transcricao, extracao,
agente de contexto, modelo ou tool. Para audio da equipe, falha de download ou
transcricao preserva mensagem, autoria e pausa.

### 6.2 Contexto reconstruivel

O contexto operacional nao pode depender apenas de memoria do modelo ou Redis.
Ele deve ser reconstruido a partir de:

- historico canonico do escopo completo;
- resumo operacional versionado;
- fatos estruturados e suas fontes;
- mensagens novas ainda nao incorporadas ao resumo;
- politica e versao de configuracao aplicaveis.

Resumo e fatos devem carregar versao, escopo e IDs das mensagens de origem.
Uma atualizacao de contexto e uma proposta validada; ela so substitui a versao
duravel apos checagem de origem e concorrencia.

### 6.3 Proposta nao e efeito confirmado

O cerebro devolve decisoes, acoes propostas e eventos de dominio. Isso nao
prova que uma mensagem foi entregue ou uma tool foi executada.

- Tool privada executa no cerebro; um adaptador deterministico atesta a
  operacao, invocacao, resultado e referencia de dominio.
- O mestre valida capacidade e correlacao antes de aceitar o evento.
- `Provider Send` e o unico ponto com credencial de saida.
- Uma acao vira `sent` somente com confirmacao do provedor.
- Resultado ambiguo vira `delivery_unknown` e exige reconciliacao; nao e uma
  falha segura para retry automatico.
- Acoes ja confirmadas nunca sao repetidas ao retomar um plano parcial.

## 7. Pausa, retomada, handoff e agendamento

Bloqueios sao registros independentes. Encerrar um `block_id` nunca apaga
outro motivo ativo.

| Motivo | Inicio | Termino | Regra de saida |
| --- | --- | --- | --- |
| Intervencao humana | toda mensagem da equipe cria ou renova prazo por empresa | expiracao ou remocao excepcional auditada | bloqueia respostas, follow-ups e lembretes |
| Pausa manual | comando autorizado, com prazo ou indefinido | expiracao ou comando explicito | bloqueia toda saida automatica |
| Handoff | pedido validado cria pendencia e bloco | handoff encerrado mais comando manual de retomada | bloqueia toda saida automatica |
| Agendamento | confirmacao atestada da tool cria bloco por evento, se a politica da empresa ligar a pausa pos-agendamento | termino original ou remocao manual | bloqueia respostas/follow-ups; admite lembrete do proprio evento, inclusive apos remocao manual do bloco |

Regras obrigatorias:

- Evento humano atrasado e registrado, mas nunca encurta o prazo calculado por
  uma intervencao mais recente.
- `await_new_message` e a retomada padrao: ao cair o ultimo bloqueio, aguardar
  a proxima mensagem do lead.
- `answer_pending` e opcao por empresa e cria uma unica execucao idempotente
  quando o ultimo bloqueio termina.
- Resolver ou perder um handoff nao retoma a IA. Retomada e comando manual
  separado e remove apenas o bloco daquele handoff.
- Texto livre do modelo nao resolve, remove ou retoma handoff.
- Uma resposta preparada antes de intervencao humana e suprimida pela mudanca
  de `state_version`/`delivery_epoch`.
- Mensagem nova do lead antes do envio descarta a resposta nao enviada e
  reprocessa o lote; bolhas enviadas e efeitos de tools nao se repetem.

Politica pos-agendamento por empresa (Supabase central, sem valor fixo no
codigo; inicial: Miranda ligada, Detail desligada). Com a pausa ligada:

- `appointment.confirmed` precisa de inicio, fim, timezone, referencia opaca,
  invocacao da tool e chave idempotente.
- O bloqueio dura ate o fim previsto.
- So o lembrete do mesmo evento confirmado pode atravessar esse bloco, desde
  que nenhum bloqueio global o proiba.
- Cancelamento marca o evento como cancelado e impede lembretes, mas preserva
  a expiracao original da pausa.
- Se a pausa ja expirou ou foi removida, cancelamento nao a recria.
- Remocao ou expiracao desse agendamento nao encerra outros bloqueios.

## 8. Prompt e agente de contexto por empresa

Direcao aprovada: um agente de contexto compartilhado, configurado por empresa
no Supabase central. A tabela planejada e `lexia_context_agent_configs`; ela
ainda nao foi criada.

Cada configuracao e selecionada exatamente por `environment + cliente_slug` e
possui versao, status, prompt nao secreto, schema comum, schema de campos da
empresa, locale, timezone e alias de politica de modelo. Deve existir no maximo
uma versao ativa por escopo.

Regras:

- Configuracao ausente, duplicada, inativa ou invalida falha fechado.
- Nunca usar prompt global, ultimo prompt em cache ou prompt de outro tenant.
- O mesmo item validado alimenta um unico node Set generico.
- Prompt de contexto nao e o prompt privado do cerebro e nao contem tools,
  credenciais ou destinos.
- Saida comum fica em `operational_context`; extensoes validadas ficam em
  `company_fields`.
- Memoria privada, raciocinio, respostas brutas de tools e IDs de calendario
  permanecem no cerebro.
- Resultado de contexto e vinculado a escopo, `context_call_id`, versao e lista
  ordenada de mensagens de origem.
- Prompts sao administrados apenas por caminho server-side autorizado e nao
  sao devolvidos ao navegador.

Hoje essa busca e simulada em `lib/omnichannel/context-config.ts` e nos exports
inativos. Nao existe leitura real do Supabase central nesta branch.

## 9. Responsabilidades dos workflows

### Mestre omnichannel

Resolve escopo confiavel, deduplica, persiste, aplica comandos de estado,
orquestra contexto, chama o cerebro por contrato, valida propostas/eventos,
revalida cada acao e registra o resultado. Nao contem prompt privado, tool do
cliente ou credencial do cerebro.

### Adaptadores de canal

Autenticam conta/provedor e convertem Meta, Z-API ou outro canal em evento
canonico. Preservam IDs, timestamps, autoria, eco, midia e origem de anuncio.
O adaptador de saida e o unico componente autorizado a enviar ao provedor.

### Agente de contexto

Usa configuracao central validada para produzir resumo e fatos operacionais
comuns. Nao envia mensagens e nao acessa dados privados do cerebro.

### Cerebro e tools

Continuam em workflow privado por cliente. Recebem `lexia.brain.request.v1` e
devolvem `lexia.brain.result.v1`. Tools executam ali; somente eventos
estruturados e atestados cruzam a fronteira. Google Agenda e outras tools
continuam configurados manualmente no cerebro.

### Lembretes e follow-ups

Continuam separados. Submetem `lexia.automation.request.v1` ao mestre e passam
pelo mesmo estado, dedupe e gate. Nao possuem rota alternativa de envio.

### Handoff, expiracao e recuperacao

O mestre persiste estado e handoff. Notificacao da equipe e automacao separada
e nao altera pausa por conta propria. Expiracao encerra somente o motivo
vencido. Recovery reconcilia projecoes e resultados incompletos sem inventar
efeitos.

## 10. Concorrencia, duplicacao e ordem

- IDs de evento, comando, invocacao, acao e projecao sao independentes.
- Dedupe inclui o escopo completo e usa codificacao sem separador ambiguo.
- Retry do mesmo evento nao duplica mensagem nem renova prazo novamente.
- Eventos distintos com o mesmo texto continuam distintos.
- Eventos atrasados sao persistidos, mas nao fazem estado regredir.
- Lease com fencing serializa dono do buffer, gate, envio e intervencao.
- Escopo, versao e todos os bloqueios sao relidos antes de cada acao.
- Planos compostos enviam por `sequence`; falha na acao atual impede as
  seguintes e preserva as anteriores.
- Intervencao entre duas acoes invalida o restante do plano.
- Resposta ambigua do provedor exige reconciliacao por ID, sem retry cego.
- Shadow usa `observe_only`, nao recebe credencial e nunca pode enviar.

## 11. O que esta implementado

Implementacao local real, sem rede:

- JSON Schemas v1 explicitamente provisorios, inclusive eventos e comandos do
  CRM;
- tipos e contratos em `lib/omnichannel/contracts.ts`;
- escopo, chaves Redis planejadas e idempotencia;
- configuracao de contexto simulada e validacao da saida;
- autoria, historico, midia e adaptadores falsos;
- maquina pura de bloqueios, retomada, handoff e agendamento;
- fronteira do cerebro e correlacao local de auditoria de tools;
- plano ordenado e gate de entrega por acao;
- validador de schema local com `date-time` estrito e falha fechada para
  recursos nao suportados;
- fixtures para duas empresas sinteticas.

Esses modulos puros executam localmente e seus testes cobrem as regras
descritas. Harnesses separados ja exercitaram Supabase/Redis descartaveis e
Frappe/Supabase com manifesto e limpeza. Os modulos nao acessam por conta
propria modelos ou provedores.

## 12. O que e apenas simulacao

`n8n/omnichannel/` contem um mestre e 17 subworkflows inativos. Eles usam
somente Manual Trigger, Code e Set, com fixtures, adaptadores, contexto,
cerebro, automacao e provider falsos.

Eles demonstram fronteiras e passagem de dados. Nao sao:

- o mestre integrado pronto;
- exports para importar ou ativar;
- prova de compatibilidade com a versao publicada do n8n;
- integracao com Supabase ou Redis;
- adaptadores reais Meta/Z-API;
- cerebros, tools, lembretes ou follow-ups reais;
- prova de autenticidade de eventos de tools.

Nao acrescente credenciais, URLs ou IDs reais para transforma-los em algo
executavel sem passar pelos gates da especificacao.

### Candidatos funcionais da Miranda

`n8n/miranda-v2-candidate/` e uma camada posterior e diferente do harness. Sao
seis exports consolidados a partir de 16 blocos reestruturados dos workflows
privados, todos inativos e sanitizados. Eles documentam a ordem local
pretendida: mensagem antes de pausa/midia, bloqueio humano antes de trabalho
caro, contexto isolado, tools atestadas, CRM em eventos, automacoes pelo mesmo
gate e um unico provider send.

O caminho reverso aceita pausa, resolucao/retomada de handoff, cancelamento e
presenca/no-show por `lexia.crm.command.v1`. O adaptador Meta percorre webhooks
agrupados sem perder o segundo evento. Testes de grafo e execucao local do
JavaScript verificam essas propriedades.

Ainda nao e um mestre integrado pronto. Depois de a instancia rejeitar um pai
ligado a filhos nao publicados, a solucao foi criar seis runtimes compactos em
`n8n/miranda-v2-lab-runtime/`, sem enfraquecer a validacao. Eles reutilizam os
mesmos IDs remotos, possuem apenas gatilho interno, Code e Execute Workflow, e
foram publicados no laboratorio antes do gateway. Os candidatos detalhados
permanecem no Git como referencia; Calendar, providers, bancos, modelos e tools
reais seguem pendentes.

O Agent Test do Frappe esta no modo `remote`. A UI persiste cada mensagem
sintetica, chama o gateway autenticado, recebe a resposta correlacionada e a
mantem suprimida. O alvo omnichannel atravessa Entrada, Atendimento, CRM e
Saida; os outros cinco alvos tambem foram exercitados por HTTP. Falhas
encontradas no primeiro ensaio foram corrigidas com regressao: conversa
persistente tem identidade diferente do `run_id`, o sandbox n8n nao expoe
`structuredClone` e o gateway precisa extrair `.body` do envelope Webhook antes
de validar. Requisicoes sem autenticacao ou com segredo incorreto retornaram
HTTP 403. Nenhum modelo, tool, canal ou provider foi chamado.

Em 10/10/2026, o gateway deixou de chamar as seis copias compactas e passou a
chamar os seis workflows HML completos por ID. Foram adicionadas rotas de
laboratorio fechadas em Entrada, Atendimento, Agenda e Automacoes, preservando
os ramos operacionais. Os seis alvos publicados passaram com
`provider_send_attempted = false`, e ambiente diferente de `isolated_test`
falhou fechado. As copias compactas remotas foram despublicadas e arquivadas;
os arquivos em `n8n/miranda-v2-lab-runtime/` permanecem apenas como fixtures.

## 13. Testes ja executados

Ultima rodada local registrada em 10/10/2026:

| Comando | Resultado |
| --- | --- |
| `npm run test:lote2:local` | 170/170 aprovados |
| `npm test` | 221/221 aprovados |
| runtime Miranda v2 focado | 28/28 aprovados |
| `npm run lint` | aprovado |
| `npm run typecheck` | aprovado |
| `npm run build` | aprovado, 29 rotas |
| JSONs e `git diff --check` | aprovados |

Cobertura relevante: isolamento entre duas empresas, origem do contexto,
schemas aninhados, `date-time`, pausa simultanea, evento humano atrasado,
transcricao falha, cancelamento, tool audit, dedupe, resposta obsoleta, entrega
parcial e resultado incerto.

Esses testes nao comprovam integracao real. Supabase/Redis descartaveis,
Frappe/Supabase e o corredor Frappe-n8n foram exercitados em laboratorio, mas
canal, provider, modelo, cerebro, tools, Calendar e ramos operacionais ainda
nao foram conectados.

## 14. Integracoes ainda nao realizadas

- As migrations do Lote 2 foram aplicadas somente ao Supabase descartavel
  confirmado; staging e producao permanecem intocados.
- O Redis descartavel foi usado somente pelo harness e terminou sem chaves
  runtime; o Redis operacional compartilhado ainda nao foi ligado.
- O gateway e os seis workflows HML completos estao publicados no n8n de
  laboratorio. As rotas do Agent Test nao possuem efeitos externos; os
  runtimes compactos remotos foram arquivados e continuam apenas no Git.
- O mestre completo de `n8n/omnichannel-test/` nao foi importado como conjunto.
- Nenhum canal, provider, modelo, transcritor, cerebro ou tool real foi chamado.
- Nenhuma autenticidade de evento de tool foi comprovada.
- Nenhum shadow, piloto, cutover, rollback operacional ou producao ocorreu.
- A plataforma ativa e `lib/redis/agent-locks.ts` ainda usam o legado.
- Asteric continua fora do escopo.

## 15. Proxima ordem segura

1. Revisar este handoff, a especificacao e o diff local.
2. Revisar as rotas de laboratorio dos seis workflows HML e seus resultados no
   Agent Test.
3. Exercitar no navegador os comandos Frappe de pausa, handoff, cancelamento e
   presenca contra consumidor n8n falso.
4. Resolver o PostgreSQL 15 do n8n antes de considerar a instalacao candidata
   a producao; a CLI recomenda 17, com 16 apenas em compatibilidade.
5. Projetar a troca de cada simulacao por uma integracao falsa de laboratorio,
   com contrato e credencial proprios, antes de qualquer servico real.
6. Integrar plataforma atras de feature flag, preservando o legado.
7. Comparar em shadow sem credencial de saida, com v1 como unico dono.
8. Escolher piloto e conectar um cerebro somente com nova aprovacao.

Producao exige ainda backup com restauracao verificada, staging, plano de
rollback e aprovacao separada.

## 16. Guardrails finais

- Nao use dados reais em fixtures ou logs.
- Nao copie exports brutos, tokens, destinos ou IDs de credenciais.
- Nao exponha service role, prompt privado ou URL de workflow ao navegador.
- Nao confunda Supabase externo de metricas com acesso ao banco privado do
  cerebro.
- Nao trate Redis como fonte duravel.
- Nao use ausencia de chave Redis como permissao para enviar.
- Nao faca `DEL` amplo ao encerrar um bloqueio.
- Nao converta `delivery_unknown` em retry automatico.
- Nao marque proposta do modelo como efeito confirmado.
- Nao inclua Asteric sem decisao de escopo.
- Nao corrija o ref Git invalido nesta fase.
- Nao execute servicos, SQL, workflows, commit, push, merge ou deploy sem
  autorizacao explicita.
