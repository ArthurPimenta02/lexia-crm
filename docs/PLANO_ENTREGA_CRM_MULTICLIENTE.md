# Plano de Entrega — CRM Lexia multi-cliente

> Este documento é o plano de **produto** (o que falta para o CRM ser entregável
> a um cliente pagante). Ele complementa, e não substitui:
>
> - `PLAN.MD` — estabilização, riscos P0/P1, critérios de aceite técnicos.
> - `Agent.MD` — arquitetura e operação atuais.
> - `AGENTS.md` — regras locais do repositório.
>
> Em caso de conflito, `PLAN.MD` manda nos itens P0. Nenhuma fase deste plano
> deve começar com um P0 de `PLAN.MD` em aberto.
>
> Criado em 2026-10-13. Branch de referência: `codex/lote-2-workflow-mestre-omnichannel`.

---

## 0. Correção de rumo: metade disto já existe

Este plano foi reescrito depois de ler `supabase/migrations/`. A conclusão mais
importante do levantamento é esta:

**O control plane de eventos e de configuração por cliente já está construído.**
Propostas anteriores de criar `lexia_eventos` e `lexia_clientes_config` estavam
erradas — duplicariam tabelas existentes e criariam duas fontes da verdade.

| Precisava de | Já existe | Observação |
|---|---|---|
| Log append-only de eventos | `lexia_conversation_state_events` | Tem `command_type`, `payload jsonb`, `occurred_at`, e **idempotência** via `unique (conversation_id, command_id)` |
| Estado atual da conversa | `lexia_conversation_states` | Tem `state_version`, `fencing_counter`, `projection_status` |
| Agendamento + comparecimento | `lexia_appointment_events` | Tem `attendance_status` (`attended`/`no_show`) |
| Config por cliente (buffer, pausa) | `lexia_omnichannel_policies` | **Versionada** (`policy_version`, `status`) |
| Config por cliente (timezone, locale, prompt) | `lexia_context_agent_configs` | Tem `company_fields_schema jsonb` — é a camada de especificidades |
| Provedor de WhatsApp por canal | `lexia_channel_accounts` | `provider in ('meta','zapi','fake')` |
| Rollout seguro | `delivery_owner` + `delivery_mode` | `observe_only` → `deliver` |

**Regra derivada: estender o que existe, nunca criar tabela paralela.** Antes de
qualquer migration nova, procurar a tabela equivalente em
`supabase/migrations/` e verificar se o caso novo não é só mais um valor de enum
ou mais uma chave no `jsonb`.

### Três padrões já no repo que todas as fases devem seguir

1. **`environment`** — toda tabela nova precisa da coluna
   `environment in ('local','isolated_test','staging','production')`, como as
   existentes. É o que permite testar sem tocar em produção.
2. **Idempotência por `command_id`** — `unique (conversation_id, command_id)`.
   Significa que **retry do n8n é seguro**: reexecutar o mesmo comando não
   duplica evento. Todo workflow novo deve gerar um `command_id` determinístico
   (ex.: `followup:<identificador>:<etapa>:<tentativa>`), nunca um UUID aleatório.
3. **Config versionada, nunca editada** — `policy_version` + `status in
   ('active','superseded')`. Mudança de regra cria versão nova; a antiga fica
   para o histórico continuar explicável. `lexia_appointment_events` guarda o
   `policy_version` usado no momento da confirmação — mantenha esse padrão.

---

## 1. Doutrina: como cada cliente mantém as suas especificidades

O requisito do negócio é: **unificar sem achatar**. A regra é separar em três
camadas e nunca deixar algo escorregar para a camada errada.

### Camada 1 — Núcleo (igual para todos)

Tabelas compartilhadas com `cliente_slug`. Campos que só um cliente tem vão para
`jsonb dados_especificos` (ou o `company_fields_schema` já existente), **nunca**
como coluna nova que fica nula para os outros.

| Hoje (fragmentado) | Destino |
|---|---|
| `marcacoes` (Detail) · `agendamentos_miranda_skin` (Miranda) | `lexia_agendamentos` |
| `servicos_detail_by_cordeiro` · `agendamento_servicos` · `servicos_miranda` | `lexia_servicos` |
| `lexia_followups` (chave `sender_id`) · `lexia_followups` (chave `identificador`) | `lexia_followups`, chave **`identificador`** |

Campos que viram `dados_especificos`: `viatura`, `variante`, `resumo_queixa`,
`sinal_valor`, `precos_por_categoria`.

A chave canónica é **`identificador`** (`'whatsapp:' + telefone`), compatível com
`lexia_conversation_states.identificador_conversa`. Detail usa `sender_id` hoje e
precisa migrar.

### Camada 2 — Configuração (dado, não código)

Tudo isto é linha em tabela, editável no CRM, **sem deploy**:

| Parâmetro | Detail | Miranda | Onde mora |
|---|---|---|---|
| timezone | `Europe/Lisbon` | `America/New_York` | `lexia_context_agent_configs` |
| locale / idiomas | pt | pt·en·es | `lexia_context_agent_configs` |
| provedor WhatsApp | uazapi | zapi | `lexia_channel_accounts` |
| buffer / pausa pós-agendamento | — | 15 min | `lexia_omnichannel_policies` |
| executores | Martim, Roberto | Samuel, Bruna | `lexia_executores` *(novo)* |
| estratégia de calendário | 2 calendários | 1 calendário + prefixo | `lexia_executores` *(novo)* |
| horários por executor | — | regra do Samuel | `lexia_horarios` *(novo)* |
| dias bloqueados | — | `2026-09-05` | `lexia_dias_bloqueados` *(novo)* |
| janela de lembrete | (não tem) | 24h–2h antes, envio 7h–20h | `lexia_omnichannel_policies` |

**`lexia_executores` cobre as duas estratégias de calendário com a mesma
estrutura** — esta é a peça que elimina o `if cliente == 'miranda'`:

| cliente | nome | calendario_id | prefixo_titulo |
|---|---|---|---|
| cliente A | executor 1 | `<calendario-1>` | *(nulo)* |
| cliente A | executor 2 | `<calendario-2>` | *(nulo)* |
| cliente B | executor 3 | `<calendario-partilhado>` | `executor3 -` |
| cliente B | executor 4 | `<calendario-partilhado>` | `executor4 -` |

Os `calendario_id` reais vivem apenas na base de dados e nas credenciais n8n,
nunca neste repositorio (ver `AGENTS.md`: nao adicionar dados reais ou segredos).

Calendários separados → `calendario_id` diferente. Calendário único →
mesmo `calendario_id` + `prefixo_titulo` preenchido. **O código é idêntico.**

A regra `VOLTA_AS_AULAS` do Samuel (só 15:30–19:00, ter/qui termina 19:30) **é
dado, não código** — vira linhas em `lexia_horarios` com `valido_desde`, o que
permite programar mudança de horário com antecedência.

### Camada 3 — Módulos próprios (código isolado)

Apenas o que genuinamente não é parametrizável, em `clients/<slug>/`:

- **Detail:** classificação de viatura (`modelos_carros_*`, pg_trgm + unaccent);
  preço por categoria de viatura; regras de recolha/entrega.
- **Miranda:** matemática de duração por áreas (corpo todo → 150 min; ≥3 áreas →
  60 fixo; 2 áreas → soma; 1 área → variante); instruções pré-laser nos 3 idiomas.

Se algo nesta camada pode ser expresso como tabela, ele pertence à Camada 2.

### A regra de ouro

> **Nome de cliente não entra em nome de tabela, nem de variável de ambiente, nem
> de constante no código.**

Violações atuais a eliminar: `servicos_detail_by_cordeiro`,
`MIRANDA_UPSTASH_REDIS_REST_URL`, `clientConfigs.miranda_skin_experts` em
`lib/redis/agent-locks.ts`. Cada uma é um ponto onde adicionar cliente exige
programar.

---

## 2. Fatos de operação que condicionam o plano

- **Supabase central** (`Lexia AI - Live`, conta do Arthur, plano **Free**) —
  guarda `lexia_contactos`, `lexia_mensagens` e todo o control plane.
- **Supabase por cliente** (conta do próprio cliente) — guarda `lexia_followups`,
  agendamentos, serviços, playbook, RAG. O limite de 2 projetos/org do Free não
  é problema porque cada cliente é uma org.
- **Já existe arquitetura híbrida em produção:** o Omnichannel da Miranda faz 10
  operações em `lexia_mensagens` **central**. Se o banco central cair, o agente
  dela já para hoje. Centralizar mais tabelas não cria dependência nova.
- **Bug estrutural em produção:** `lexia_followups` está no banco do cliente e
  `lexia_mensagens` no central; o AGENTE DE FOLLOW-UP busca histórico no central
  para decidir sobre um follow-up gravado no cliente. É um JOIN entre bancos
  feito à mão. Centralizar **corrige** isto.
- **Google Calendar é a trava real de overbooking.** `verificar_disponibilidade`
  (ambos os clientes) lê apenas serviços + Calendar, nunca a tabela de
  agendamentos. Logo a tabela de agendamentos é **espelho**, e mexer nela não
  provoca venda dupla. Isso rebaixa o risco da migração de agendamentos.
- **Mas inverte qual tabela é crítica:** a tabela de **serviços** define a
  *duração*, e a duração define quanto bloquear no Calendar. Serviço com duração
  errada → 30 min bloqueados para um serviço de 150 min → dois clientes no mesmo
  horário. **Serviços migram por último e com leitura dupla.**
- **Free não tem backup automático.** Depois da centralização, o banco central
  passa a ter os agendamentos de todos os clientes. Mitigação sem pagar Pro:
  workflow n8n semanal com `pg_dump` para storage.
- **Sem migration para `lexia_contactos`/`lexia_mensagens`** — foram criadas fora
  de `supabase/migrations/`. Há risco de deriva de schema entre ambientes.

---

## 3. Fases

Notação de risco para clientes em produção (hoje: **Miranda**):
**R0** nenhum · **R1** degradação visível no CRM · **R2** pode afetar o agente
a falar com o lead.

---

### Fase 0 — Preservar antes de mexer · R0

Pré-requisito de tudo. Não começar nada com isto aberto.

1. Commitar/arquivar as alterações locais não commitadas (`CLAUDE.md`,
   `Agent.MD`, `PLAN.MD`, `n8n/README.md`). A instrução em `CLAUDE.md` é
   explícita: **preservar**. Nenhuma fase deve sobrescrevê-las.
2. Exportar os 12 workflows n8n para `n8n/` versionado, **com segredos
   removidos** — é o único backup deles hoje.
3. Rotacionar segredos expostos nos JSONs (já é P0 em `PLAN.MD` §4.2):
   token Z-API, token uazapi, números de notificação. Passam a **credenciais
   n8n do tipo Header Auth**, uma por cliente.
4. Renomear a credencial Google Calendar `Calendar Testes Arthur` — ela cria os
   eventos **reais** do Detail em produção. O nome convida a revogá-la por engano.
5. Backup: workflow semanal de `pg_dump` do banco central.

**Aceite:** workflows versionados sem segredos; nenhum token em texto claro no
repo nem nos JSONs; dump semanal a correr.
**Rollback:** n/a (só adiciona).

---

### Fase 1 — Captura de atribuição · R1 · **URGENTE**

A única fase com perda de dado irreversível a cada dia que passa.

O Meta Click-to-WhatsApp envia `referral.source_id` e `ctwa_clid` **apenas na
primeira mensagem** do lead. O nó `Normalizar Dados Operacionais` descarta.
Sem isto, o CAC pedido pelo cliente (item 5 do pedido original) é incalculável —
e o passado não se recupera.

1. No OMNICHANNEL (ambos os clientes): extrair `referral` e `ctwa_clid` do
   payload da primeira mensagem.
2. Persistir em `lexia_contactos` (colunas novas) **e** como evento
   `attribution.capture` (ver Fase 2). O contacto dá o estado; o evento dá o
   histórico.
3. Registar também a `origem` de entrada: `ctwa` · `instagram` · `orgânico` ·
   `indicação` · `desconhecido`.

**Aceite:** um lead novo de anúncio chega com `source_id` e `ctwa_clid`
gravados; lead orgânico grava `origem='orgânico'` sem erro.
**Risco:** mexe no workflow que fala com o lead. Mitigar com execução manual +
`pinData` antes de ativar, e `onError: continueRegularOutput` no nó de captura —
atribuição nunca deve derrubar o atendimento.
**Rollback:** desativar o nó. Colunas ficam nulas.

---

### Fase 2 — Eventos de follow-up e lembrete · R1

**Não criar tabela nova.** Estender o enum `command_type` de
`lexia_conversation_state_events`.

O problema atual: todos os 7 nós do AGENTE DE FOLLOW-UP são `update`, e `update`
**sobrescreve**. Quando o follow-up da etapa 2 funciona, o Omnichannel chama
`Cancelar Follow-up`, o status vira `encerrado`, e a informação *"este lead foi
recuperado pela etapa 2"* deixa de existir. Não é que o CRM não mostra — o dado
é destruído no instante em que acontece.

1. Migration `202610130001_lote3_followup_reminder_events.sql`: acrescentar ao
   enum `command_type`:
   `followup.schedule` · `followup.send` · `followup.skip` · `followup.answer`
   · `followup.close` · `reminder.send` · `reminder.fail` ·
   `attribution.capture`.
2. Sub-workflow n8n **`registrar_evento`**, chamado via *Execute Workflow*.
   Ele é **único e compartilhado por todos os clientes**, porque escreve só no
   banco central com a credencial `LEXIA CRM`. É a exceção à regra de "um
   workflow por cliente".
3. Instrumentar: cada `update` do AGENTE DE FOLLOW-UP ganha um `registrar_evento`
   ao lado. `command_id` determinístico.
4. **`followup.answer` deve carregar a etapa que estava ativa** no `payload`.
   É o campo que responde "lead recuperado por follow-up".
5. No `criar_agendamento`/`criar_marcacao`: gravar `origem` no agendamento.
   O workflow da Miranda **já sabe disto** — tem um nó `Encerrar Follow-up do
   Lead` que só corre quando havia follow-up ativo. É um campo a mais num
   insert, não lógica nova.
6. AGENTE DE LEMBRETES: registar `reminder.send` **e `reminder.fail`** — hoje o
   nó HTTP da Z-API falha em silêncio. Manter `lembrete_enviado_em` (é a trava
   anti-duplicação, não remover).
7. **Não criar tabela de lembretes.** O histórico de lembrete é o log de eventos.

**Aceite:** um ciclo completo de follow-up gera a sequência de eventos esperada;
reexecutar o mesmo comando não duplica linha (idempotência).
**Risco:** se a config não vier, `cfg.campo` é `undefined` e
`if (hora >= undefined)` em JS é `false` — a trava **desaparece em silêncio** e o
lembrete sai às 3 da manhã. **Nó de guarda obrigatório que mata a execução se a
config vier incompleta. Falhar alto, nunca seguir com `undefined`.**
**Ordem:** começar pelo LEMBRETES (7 nós, pior caso é lembrete em hora esquisita);
OMNICHANNEL e Cérebro **por último** (falha ali é cliente sem resposta).

---

### Fase 3 — Catálogo e configuração operacional · R0

Tabelas novas, nenhum workflow lê ainda. Risco zero por construção.

1. Migration com **RLS ligada na criação** (não depois) e coluna `environment`:
   - `lexia_servicos` — nome, aliases, categoria, preço, duração por executor,
     `requer_avaliacao`, `multi_dia`, `dados_especificos jsonb`
   - `lexia_executores` — nome, `calendario_id`, `prefixo_titulo`, ativo
   - `lexia_horarios` — executor, `dia_semana`, `hora_inicio`, `hora_fim`,
     `valido_desde`
   - `lexia_dias_bloqueados` — data, motivo
2. Preencher com os valores que hoje estão nos nós Code dos workflows.
3. Registar `detail_by_cordeiro` em `lexia_clientes` + `lexia_omnichannel_policies`
   + `lexia_context_agent_configs` + `lexia_channel_accounts`.
4. Telas no CRM: catálogo de serviços, executores, **férias/dias bloqueados**.
   Esta última é o primeiro ganho visível — hoje `DIAS_BLOQUEADOS = ['2026-09-05']`
   está dentro de um nó Code; vira tela onde o cliente marca férias sozinho.

**Aceite:** RLS impede o deploy do Detail de ler config da Miranda; cliente
consegue bloquear um dia pelo CRM.
**Rollback:** `DROP TABLE` (ninguém lê).

---

### Fase 4 — Centralizar follow-ups e agendamentos · R1→R2

A fase que desbloqueia o kanban: **view não cruza bancos diferentes.**

Sub-faseada do mais seguro para o mais perigoso. **Uma por janela.**

- **4a · `lexia_followups` → central.** Chave unificada `identificador`
  (Detail migra de `sender_id`). Unificar o acesso: Detail usa SQL cru em
  "Buscar Follow-ups Vencidos", Miranda usa node Supabase. Corrige o JOIN
  entre bancos. *Pior caso: um lead recebe follow-up duplicado ou nenhum.*
- **4b · agendamentos → `lexia_agendamentos`.** Protegido pelo Google Calendar,
  que continua a ser cópia completa. Decidir a relação com
  `lexia_appointment_events` (que é conversation-scoped e não tem serviço,
  executor nem valor): **estender** ou tabela operacional ao lado com FK.
  *Pior caso: CRM mostra histórico incompleto por algumas horas.*
- **4c · serviços → `lexia_servicos`.** O risco real (duração → overbooking).
  **Leitura dupla obrigatória:** workflow lê do central e, se vier vazio, cai
  para a tabela local. Uma semana assim, conferir, só então remover o fallback.
  **Nunca cortar seco.**

**Aceite por sub-fase:** contagem de linhas igual origem/destino; agente cria
agendamento com duração correta; nenhum horário vendido em duplicado.
**Rollback:** reapontar a credencial do nó para o banco antigo (os dados antigos
ficam intactos até o aceite).

---

### Fase 5 — Paridade de workflows e template de cliente novo · R1

O levantamento revelou algo não intencional: **cada cliente tem o que o outro
não tem.**

- Miranda tem AGENTE DE LEMBRETES e **não** tem SENTINELA DE AGENDA → edição
  manual no calendário dela nunca chega ao sistema.
- Detail tem SENTINELA e **não** tem lembretes → clientes dele não recebem aviso
  de véspera.

Nenhum dos dois é especificidade de negócio — é só o que houve tempo de
construir. Padronizar em **7 workflows**:

1. OMNICHANNEL · 2. Cérebro · 3. `criar_agendamento` ·
4. `verificar_disponibilidade` · 5. AGENTE DE FOLLOW-UP ·
6. AGENTE DE LEMBRETES · 7. SENTINELA DE AGENDA

Mudanças transversais:
- Constantes dos nós Code passam a vir de um nó `Carregar Config` no início.
  Antes: `const TZ='America/New_York'; if (h<7||h>=20) return [];`
  Depois: `const cfg=$('Carregar Config').first().json;` → pedido do cliente
  passa a ser **mudar um número no CRM**, nunca abrir o n8n.
- `WHERE cliente_slug = …` nas queries do Cérebro.
- Prefixo Redis vem de config — foi o prefixo hardcoded que mascarou o bug da
  credencial cruzada já corrigido.
- SENTINELA reconcilia Calendar ↔ tabela e emite `appointment.cancel` /
  alteração: é assim que edição manual na agenda chega ao CRM sem ninguém digitar.
- `handoff.request` no `ENCAMINHAR_EQUIPE`.

**Limitação a aceitar:** o n8n **não aceita expressão no seletor de credencial**.
Continua **um workflow por cliente**. O ganho não é "um workflow para todos" —
é que passam a ser **cópias idênticas** cujo comportamento vem da config.

**Cliente novo = duplicar os 7 + 1 linha de config + 2 credenciais** (Supabase do
cliente, Redis do cliente). `registrar_evento` já existe e é compartilhado.

**Nota:** cada workflow terá **duas credenciais Supabase** — a central (config,
agendamentos, follow-ups, serviços) e a do cliente (RAG, playbook, a
"inteligência"). É esperado, não é erro.

**Aceite:** dar lembretes ao Detail = duplicar + config, sem escrever lógica de
fuso/janela/idioma.

---

### Fase 6 — Pipeline auto-classificado · R0

O requisito: a pessoa vê tudo sem abrir WhatsApp e Instagram, e tudo vira métrica.

**Dois eixos, nunca um.**

**Eixo 1 — a coluna = estado operacional, determinístico, derivado por SQL:**

| Etapa | Como se sabe |
|---|---|
| Novo Lead | contacto criado, lead ainda sem resposta |
| Conversa Acontecendo | última mensagem < X h, sem follow-up ativo |
| Lead em Follow-up | `lexia_followups.status = 'ativo'` |
| Lead Agendado | existe agendamento futuro para o `identificador` |
| Lead Perdido | follow-up encerrado sem agendamento |
| Precisa de Humano | handoff aberto |

**Nenhuma precisa de IA.** Pedir a um LLM para decidir "este lead está
agendado?" troca certeza por probabilidade: ele acerta ~95%, o banco acerta
100%, instantaneamente e sempre igual. Os 5% aparecem onde doem — lead agendado
parado em "Lead Perdido" — e basta uma vez para o board perder a confiança.

**Eixo 2 — a etiqueta no cartão = leitura comercial, IA. Já existe.**
`lib/analyst/classifier.ts` já produz `resumo`, `intencao`, `sentimento`,
`objecoes`, `confianca`, com versionamento de prompt e redação de dados. É o que
resolve "sem abrir o wpp": o cartão mostra numa linha o que o lead quer.

**Cuidado:** o enum `etapa_comercial` do classificador
(`descoberta`/`qualificacao`/`consideracao`/`negociacao`) é um funil B2B e
**não** é a coluna do kanban. São eixos diferentes. Misturar os dois = LLM
decidindo coluna.

**A etapa é derivada, não armazenada.** Implementar como **VIEW**. Se fosse
coluna escrita pelo n8n, bastava um workflow falhar no meio para o lead ficar
preso na coluna errada — sem erro, só um cartão no lugar errado. Com view, a
dessincronização é impossível por construção, e mudar a regra ("perdido passa a
45 dias") é editar a definição, não reprocessar 10.000 leads.

O "atualiza sozinho" sai de graça: a view lê as tabelas onde o n8n já escreve.
**Não construir websocket nem fila para isto.**

**Detalhe operacional obrigatório desde o dia 1:** "Novo Lead" vai inundar — em
WhatsApp de volume a maioria nunca responde, e board com 800 cartões é board que
ninguém usa. Precisa de filtro de período por padrão (30 dias) e arquivamento
automático (silêncio há N dias → sai do board).

**Métricas** (tempo em etapa, conversão entre etapas, motivo de perda,
"agendamento após follow-up") saem do **log de eventos**, não do estado atual —
estado atual não responde perguntas sobre o passado.

**Definição a fechar antes de construir a tela:** o que é "lead recuperado"?
Responder ou agendar? Em quanto tempo? Sugestão: *agendamento até 7 dias após
mensagem de follow-up, atribuído ao último follow-up enviado.* Sem regra
escrita, o número é contestado uma vez e ignorado para sempre.

---

### Fase 7 — Ficha de cliente, produtos e margem · R0

Itens 1 e 4 do pedido original.

1. Estender `lexia_contactos`: endereço, NIF/consentimento, notas.
2. `lexia_produtos` (custo unitário, unidade) + `lexia_servico_produtos`
   (consumo por serviço) → custo e **margem por serviço**.
3. Ficha: histórico de serviços, total gasto, ticket médio, recência.
4. Relatório de margem por serviço — responde "em qual temos mais lucro".

Depende da Fase 4 (sem agendamentos centralizados não há histórico por cliente).

---

### Fase 8 — Campanhas e CAC · R0

Item 5 do pedido original: *750 € investidos → 4 agendamentos → 187,50 €/agendamento.*

1. `lexia_campanhas` + `lexia_campanha_custos` (gasto por dia/campanha).
2. Ingestão Meta Ads (Google depois) — **começar com import manual/CSV**. A API
   é um projeto por si; não bloquear o CAC nela.
3. Juntar gasto × agendamentos via atribuição da Fase 1.
4. Dashboard: CAC por campanha, por serviço, e **CAC de leads recuperados por
   follow-up** (o número que justifica o agente).

Depende criticamente da Fase 1 — sem `source_id` não há a que atribuir.

---

### Fase 9 — Design system · R0

Deliberadamente tardio, a pedido. Diagnóstico: `app/globals.css` define
**2 tokens de cor** e o `package.json` **não tem nenhuma biblioteca de UI**. A
comparação com o Frappe CRM é injusta porque o Frappe traz `frappe-ui` pronto.

1. shadcn/ui + Radix sobre o Tailwind 4 já instalado.
2. Tokens (cor, espaçamento, raio, tipografia) e primitivos: Dialog, Select,
   Dropdown, Tabs, Toast, DataTable.
3. Migrar telas por ordem de visibilidade: pipeline → conversas → ficha →
   dashboards → admin.
4. Preservar o que já está certo em `globals.css`: `focus-visible` e alvos de
   toque de 44 px.

**Fazer depois das Fases 6–8, não antes:** tela bonita sobre dado inexistente é
exatamente o resultado da tentativa anterior de CRM.

---

### Fase 10 — Isolamento por deploy e entrega · R1

**Não remover a multi-tenancy do código** — são 165 ocorrências de
`cliente_slug` em 30+ ficheiros, 38 políticas RLS, mais todos os workflows.
Remover custa muito e não entrega nada.

**1 repo, N deploys:** um `main`, um projeto Vercel por cliente, `LEXIA_CLIENT_SLUG`
travando cada deploy num único cliente em runtime. Isolamento sem pagar
manutenção 4×. Duplicar o repo significa corrigir o mesmo bug de login 4 vezes
— na prática, parar de fazer melhorias.

1. Tirar config de cliente do código: eliminar `clientConfigs` em
   `lib/redis/agent-locks.ts` e o prefixo `MIRANDA_` nas env vars.
   Hoje `hasAgentLocksIntegration()` devolve `false` em silêncio para cliente
   não listado — o Detail não funciona sem editar TypeScript.
2. `LEXIA_CLIENT_SLUG` + guard em `lib/auth/access-context.ts`
   (`requireClientPanelAccess`, `requireOperationalClientAccess`) e `middleware.ts`
   (não existe hoje).
3. Navegação e rotas lidas da config, não de condicionais no código.
4. **Detail by Cordeiro primeiro** (não está em produção, erro é barato).
5. **Miranda por último.** A URL de login dela muda: subir o deploy novo, testar
   com a conta dela, só então avisar. Nada de trocar DNS antes de validar.
6. Entrega: manual curto por cliente (férias, catálogo, pipeline, relatórios).

---

## 4. Três regras de execução

1. **Nunca duas mudanças na mesma janela.** Se o agente quebrar depois de mexer
   em config *e* credencial juntas, não há como saber qual foi. Um passo,
   observar um dia, próximo.
2. **Testar com execução manual + `pinData` antes de ativar.** O n8n permite
   correr o workflow sem o trigger e inspecionar cada nó. É o ambiente de teste,
   de graça. Usar também `environment='isolated_test'`.
3. **Nada da Fase 4 antes das Fases 1–3 estáveis.** Mover dados com a config
   ainda a ser lida do código mistura os dois riscos.

---

## 5. Decisões pendentes

| # | Decisão | Bloqueia |
|---|---|---|
| 1 | Connection string do Supabase central | Fase 3 |
| 2 | Lista completa de tabelas do Supabase da Miranda | Fase 4 |
| 3 | `lexia_agendamentos` estende `lexia_appointment_events` ou fica ao lado com FK? | Fase 4b |
| 4 | Definição de "lead recuperado" (sugestão: 7 dias) | Fase 6 |
| 5 | Confirmar slug `detail_by_cordeiro` | Fase 3 |
| 6 | RAG/embeddings ficam no Supabase do cliente? (recomendação: sim) | Fase 4 |
| 7 | Janela de arquivamento do pipeline | Fase 6 |

---

## 6. Ordem curta

```
Fase 0  Preservar + rotacionar segredos          R0  ← pré-requisito
Fase 1  Atribuição Meta                          R1  ← URGENTE (perda diária)
Fase 2  Eventos de follow-up e lembrete          R1
Fase 3  Catálogo e config + onboarding Detail    R0
Fase 4  Centralizar followups → agend. → serviços R1→R2 (uma por janela)
Fase 5  Paridade dos 7 workflows + template      R1
Fase 6  Pipeline auto-classificado + métricas    R0
Fase 7  Ficha de cliente, produtos, margem       R0
Fase 8  Campanhas e CAC                          R0
Fase 9  Design system                            R0
Fase 10 Deploy por cliente + entrega             R1
```

Fases 0–2 são sequenciais. A 3 corre em paralelo com a 2. A 9 pode correr em
paralelo com 6–8 se houver mãos. A 10 fecha.
