# Lote 2 - Revisão e ensaio isolado do banco

> Estado em 09/10/2026. O baseline, as migrations, fixtures e verificações
> foram aplicados somente ao projeto descartável `gaofupndxgitonfmvpzi`. O
> runtime integrado também usou somente o Redis exclusivo de teste, provider
> `fake` e `observe_only`. Produção, staging e bancos de clientes continuam
> sem autorização.

## 1. Arquivos para revisão

| Arquivo | Papel | Escreve? |
| --- | --- | --- |
| `supabase/checks/202610080001_lote2_preflight.sql` | confere alvo, helpers do Lote 1, ausência dos objetos novos, colunas, constraints, grants e gatilhos das tabelas legadas | não; o bloco final só aborta |
| `supabase/migrations/202610080001_lote2_omnichannel_control_plane.sql` | tabelas, colunas aditivas, gatilhos de integridade, RPCs, RLS e grants | sim |
| `supabase/migrations/202610090001_lote2_state_event_command_types.sql` | acrescenta os tipos já emitidos por resolução de handoff e presença/no-show ao log de estado | sim |
| `supabase/checks/202610080002_lote2_verify.sql` | confere RLS, grants, colunas visíveis, `security definer`, `search_path` e a regra do admin | não; o bloco final só aborta |
| `supabase/operations/202610080002_lote2_seed_initial_policies.sql` | políticas iniciais: Miranda com pausa ligada, Detail desligada | sim, com variáveis obrigatórias |
| `supabase/operations/202610080001_lote2_disable_delivery.sql` | rollback operacional: volta todas as contas do ambiente para `observe_only` e dono v1, sem apagar nada | sim |
| `supabase/rollbacks/202610080001_lote2_omnichannel_control_plane_down.sql` | rollback destrutivo, só para projeto descartável ou após backup restaurado | sim; recusa se houver dados v2 sem confirmação explícita |

## 2. O que a migration cria

Tudo é aditivo. Os workflows atuais e `lib/redis/agent-locks.ts` não leem
nada disso e continuam iguais.

| Tabela | Conteúdo |
| --- | --- |
| `lexia_channel_accounts` | conta opaca por ambiente, empresa, canal e provedor; dono e modo de entrega (`observe_only` por padrão) |
| `lexia_omnichannel_policies` | política versionada por empresa: retomada, prazo humano, janela do buffer e `pause_after_appointment` (obrigatório, sem default) |
| `lexia_context_agent_configs` | prompt e schema do agente de contexto por empresa, uma versão ativa |
| `lexia_brain_bindings` | `brain_ref` lógico e capacidades, sem destino |
| `lexia_conversation_states` | conversa canônica: versão, epoch, sequência do lead, fencing |
| `lexia_conversation_blocks` | um registro por motivo de bloqueio |
| `lexia_conversation_state_events` | log append-only e idempotente dos comandos |
| `lexia_ingress_events` | deduplicação de entrada por conta e ID do provedor, sem payload |
| `lexia_inbound_batches` e `lexia_inbound_buffer_entries` | buffer durável: lotes, corte, fencing e reaproveitamento do lote descartado |
| `lexia_appointment_events` | agendamento atestado, política capturada na confirmação, confirmação única e presença/no-show operacional |
| `lexia_automation_requests` | pedidos idempotentes de lembrete e follow-up |
| `lexia_outbound_actions` | ações de saída com claim, fencing e status monotônico |
| `lexia_conversation_contexts` | contexto operacional versionado com origem |
| `lexia_omnichannel_projection_outbox` | reprojeção do central para o Redis |

Colunas novas, todas anuláveis, em `lexia_contactos`, `lexia_mensagens`
(conversa v2, autor, IDs e horário do provedor, sequência do lead, mídia) e
`lexia_handoffs` (conversa v2, bloqueio, idempotência, resolução e retomada
separadas). Presença/no-show fica em `lexia_appointment_events`; cancelamento
marca o fato como cancelado sem criar ou encerrar bloqueio.

## 3. Quem pode fazer o quê

| Papel | Pode |
| --- | --- |
| `anon` | nada |
| `authenticated` (cliente) | ler a política, bloqueios, estado resumido e agendamentos da própria empresa, por `lexia_user_can_access_cliente`; não lê prompts, contas, ações nem buffer |
| `authenticated` (admin Lexia) | o mesmo para todas as empresas, e é o único que executa `lexia_omni_create_policy` e `lexia_omni_set_appointment_pause` |
| `service_role` | ler as tabelas v2 e executar as RPCs operacionais; não escreve diretamente nas tabelas e não pode alterar a política |

A restrição do admin está no banco: as duas RPCs de política verificam
`lexia_is_admin()` a partir do JWT da sessão. Por isso a Server Action
precisa chamá-las com o cliente da sessão do usuário, não com `service_role`,
e o ambiente vem da configuração do servidor, nunca do navegador. A checagem
`requireLexiaAdmin()` da aplicação continua valendo antes da chamada.

Gatilhos impedem que `authenticated` ou `anon` alterem as colunas v2 de
`lexia_mensagens` e `lexia_handoffs` pelos fluxos legados.

## 4. Regras aprovadas e onde ficam

| Regra | Onde o banco garante |
| --- | --- |
| Toda mensagem é registrada, inclusive em pausa | `lexia_omni_record_message` antes de buffer/mídia; mensagem em pausa vira `pending` e `recebida_na_pausa` |
| Intervenção bloqueia antes de qualquer trabalho caro e nunca encurta prazo | `lexia_omni_record_human_intervention` com `greatest(...)` |
| Bloqueios independentes; encerrar um não encerra outro | `lexia_omni_end_block` encerra uma chave; expiração por motivo |
| Handoff: resolver não retoma | `lexia_omni_resolve_handoff` altera apenas a pendência; `lexia_omni_resume_handoff` exige `resolvido`/`perdido` e encerra só o próprio bloco |
| Pausa pós-agendamento por empresa, todos os canais, só na conversa do agendamento | `lexia_omni_confirm_appointment` lê a política ativa; o bloco é da conversa |
| Confirmação única vinculada à tool | `prepare` exige única e final; o claim registra `confirmation_action_id` na mesma transação; índice único |
| Lembrete após remoção manual da pausa, até o início | claim admite o próprio agendamento, nega cancelado e `appointment_started` |
| Mensagem nova do lead descarta a resposta não enviada | `lead_cutoff_seq` obrigatório em respostas; claim suprime o restante como `superseded_by_new_message`; `lexia_omni_supersede_inbound_batch` devolve o lote |
| Buffer preservado e consumo seguro | `lexia_omni_claim_inbound_batch`: eleição por sequência, janela da política, um lote ativo, claim atômico |
| Revalidação antes de cada envio | `lexia_omni_claim_outbound_action` sob lock da conversa |
| Resultado incerto não é reenviado | status monotônico; retry só de `failed`; `delivery_unknown` só por reconciliação |
| Cancelamento preserva o estado independente da pausa | `lexia_omni_cancel_appointment` cancela lembretes e não recria/encerra bloco removido, expirado ou ativo |
| Comparecimento/no-show não controla a IA | `lexia_omni_update_appointment_attendance` grava apenas o fato operacional; recusa evento cancelado e horário anterior ao início |
| Shadow não envia | claim suprime como `observe_only` enquanto a conta não estiver em `v2`/`deliver` |

## 5. Decisões D1-D4 (aprovadas em 08/10/2026)

As quatro divergências foram resolvidas a favor do comportamento abaixo, já
aplicado no SQL e no TypeScript (`state-machine.ts`, `outbound-ledger.ts`,
`delivery-plan.ts`, `inbound-buffer.ts`):

- **D1:** mensagem do lead avança só o seu contador e não invalida lembretes;
  respostas antigas seguem protegidas pelo corte de sequência; lembretes não
  carregam corte (`reminders_do_not_carry_lead_cutoff`).
- **D2:** a confirmação é reservada atomicamente no claim; envio incerto mantém
  a reserva; falha definitiva a libera para recuperação segura. Reservado não
  significa enviado.
- **D3:** decisões reais usam `clock_timestamp()` lido depois dos locks;
  testes locais continuam com horário injetável.
- **D4:** depois de uma supressão, o restante não enviado fica suprimido; o já
  enviado é preservado; o reprocessamento cria ações novas sem repetir efeitos
  de tools.

O detalhamento original de cada divergência segue abaixo como histórico.

### D1. Mensagem do lead recebida durante um bloqueio

- **SQL:** `lexia_omni_record_lead_message` avança apenas
  `lead_message_seq`, grava a entrada como `pending` e marca a mensagem como
  `recebida_na_pausa`. `state_version` e `delivery_epoch` não mudam.
- **TypeScript:** `queuePendingMessage` (`state-machine.ts`) usa
  `mutateOnce` e avança `stateVersion` e `deliveryEpoch`.
- **Justificativa do SQL:** a mensagem do lead não muda nenhum bloqueio. Se
  mudasse a versão, um lembrete preparado antes dela seria suprimido como
  `state_changed` sem motivo real. As respostas já ficam protegidas pelo
  bloqueio e pelo corte de sequência (regra de reprocessamento).
- **Comportamento esperado:** mensagem em pausa fica registrada e pendente; a
  sequência do lead sobe uma vez por mensagem (retry não duplica); lembrete
  preparado antes continua válido se os bloqueios permitirem; resposta
  preparada antes não sai (bloqueio e, ao fim do bloqueio, corte de
  sequência).

### D2. Momento em que a confirmação única é registrada

- **SQL:** `lexia_omni_claim_outbound_action` grava
  `confirmation_action_id` no mesmo `UPDATE` transacional do claim, e o
  índice `lexia_outbound_actions_one_confirmation_key` impede duas
  confirmações em `claimed`, `sent` ou `delivery_unknown`. Falha
  determinística ou reconciliação como `failed` libera a reserva;
  `delivery_unknown` a mantém. Não altera a versão da conversa.
- **TypeScript:** `recordAppointmentConfirmationSent` registra depois do
  envio e avança a versão.
- **Justificativa do SQL:** a especificação exige o registro na mesma
  transação do claim. Registrar depois do envio deixa uma janela em que duas
  execuções concorrentes podem reivindicar confirmações diferentes para o
  mesmo agendamento.
- **Comportamento esperado:** a segunda confirmação de outro `action_id`,
  enquanto a primeira está reivindicada, enviada ou incerta, é suprimida como
  `appointment_confirmation_already_sent`; após falha determinística da
  primeira, uma nova confirmação pode ser preparada; o retry da mesma ação
  continua possível só a partir de `failed`.

### D3. Relógio usado nas decisões

- **SQL:** o gate de envio, a avaliação de bloqueio ativo, a expiração, a
  janela do buffer, `appointment_started` e o registro de lembrete usam
  `now()` do banco. Horários de evento (`occurred_at`, início e fim do
  agendamento) continuam vindo como parâmetro.
- **TypeScript:** todas as funções recebem o horário (`at`, `now`) por
  parâmetro.
- **Justificativa do SQL:** quem chama não consegue passar um horário que
  contorne um bloqueio, e há uma única fonte de tempo para todas as
  execuções concorrentes.
- **Comportamento esperado:** um bloqueio vale até o `expires_at` medido pelo
  relógio do banco, mesmo que o n8n esteja adiantado; o harness isolado
  precisa montar dados relativos a `now()` em vez de horários fixos;
  horário de evento enviado com desvio continua podendo produzir um prazo no
  passado, como no TypeScript.

### D4. Ações restantes de um plano depois de uma supressão

- **SQL:** `lexia_omni_suppress_plan` marca a ação atual como `suppressed` e
  todas as seguintes ainda `prepared` da mesma invocação também como
  `suppressed`, com motivo `superseded_by_new_message` quando a causa é
  mensagem nova do lead, ou `plan_interrupted` nos demais casos.
- **TypeScript:** `executeDeliveryPlan` interrompe o laço e deixa as ações
  seguintes como `pending`.
- **Justificativa do SQL:** registros duráveis precisam terminar num estado
  final; uma ação `prepared` esquecida poderia ser reivindicada depois por
  recuperação ou retry. Também simplifica a detecção do reprocessamento.
- **Comportamento esperado:** nenhuma ação depois da suprimida é enviada nem
  pode voltar a `prepared` (o retry só aceita `failed`); o efeito para o
  lead é o mesmo do TypeScript; o reprocessamento gera ações novas, com novos
  IDs.

## 5a. Correções da revisão estática (08/10/2026)

1. **Claim:** `lexia_omni_claim_outbound_action(p_action_id, p_claimant)`
   devolve `out_acquired`; só a chamada que adquire recebe o token. Uma ação já
   reivindicada devolve `false` sem token. `finish` exige o mesmo claimant e o
   mesmo token.
2. **Nulos:** `lexia_omni_require` rejeita condição falsa ou nula antes de
   qualquer escrita; comparações de token, versão e sequência usam
   `IS DISTINCT FROM`.
3. **Relógio:** `clock_timestamp()` lido depois dos locks em todas as
   decisões; nenhum `now()` dentro das RPCs.
4. **Buffer:** `lexia_omni_claim_inbound_batch` recusa com `blocked` se
   houver bloqueio ativo e passa as mensagens abertas para `pending`, antes de
   contexto, cérebro ou tools.
5. **Referências:** `finish` valida que a mensagem é da mesma ação e conversa;
   `record_message` só aceita mensagem da IA ligada a ação da conversa;
   `store_context` exige mensagens de origem da conversa e empresa; o gatilho
   protege todas as colunas novas de contatos, mensagens e handoffs.
6. **Alvo e rollback:** migration, preflight, seed, desligamento de entrega e
   rollback exigem `lexia.target_project_ref` e `lexia.target_environment`
   iguais ao marcador; o marcador sozinho não basta. Staging e produção
   precisarão de marcador próprio, criado em operação aprovada; sem ele a
   migration recusa. O rollback remove gatilhos, funções (lista explícita),
   colunas e tabelas nessa ordem, sem CASCADE, com proteção de dados em todas
   as tabelas e colunas removidas.

Esses pontos estão verificados pelo modelo TypeScript
(`tests/omnichannel-outbound-ledger.test.ts`) e protegidos contra regressão
por `tests/lote2-db-contract.test.ts`. O ensaio isolado comprovou as RPCs
sequenciais e a reprojeção; corridas simultâneas e recuperação após queda de
processo continuam pendentes.

### 5.1 Harness isolado executado

O harness em `supabase/isolated/lote2/` foi aplicado somente ao projeto
descartável confirmado. Ele contém:

- preflight `READ ONLY` que exige zero relações públicas, usuários Auth,
  objetos e buckets antes da primeira escrita;
- baseline mínimo dos contratos legados e dos helpers endurecidos do Lote 1;
- marcador remoto `isolated_test` gravado na mesma transação do baseline;
- fixtures somente para `empresa_sintetica_a` e `empresa_sintetica_b`;
- contas de provider `fake`, sem destino externo e sempre `observe_only`;
- manifesto de IDs e prefixos Redis permitidos;
- verificação inicial e limpeza limitada ao manifesto, sem remover o schema;
- runner Supabase + Redis com limpeza própria das conversas e chaves runtime.

Os parsers e scripts em `scripts/lib/lote2-isolated-target.mjs` separam três
gates: conexão Postgres sem SQL, preflight somente leitura, aplicação com
`APPLY_LOTE2_ISOLATED:<project_ref>` e runtime com confirmação vinculada ao ref
e ao host Redis. O Redis aceita somente endpoint REST HTTPS oficial e recusa
hosts protegidos ou já usados.

O ensaio final passou nove cenários: identidade/vazio inicial, isolamento de
tenant e conta, deduplicação, `answer_pending`, falha de transcrição preservando
mensagem e pausa, composição de bloqueios, isolamento de contexto, supressão
`observe_only` e reprojeção stale-aware. Chamadas a modelos, canais e providers:
zero. Ao final, Redis tinha zero chaves e as linhas runtime haviam sido
removidas, mantendo as duas configurações sintéticas.

As tentativas anteriores pararam e limparam corretamente. A primeira revelou
um `event_type` inválido apenas no fixture do runner. A segunda revelou que as
RPCs emitiam `handoff.resolve` e `appointment.attendance.update`, ausentes do
`CHECK` do log; a migration-base e a migration aditiva foram corrigidas.

### 5.2 Harness Frappe + central executado

O passo seguinte usou o mesmo Supabase descartável, o Frappe local
`crm-hml.localhost:18080` e identidades técnicas separadas de operação e
integração. Antes dos efeitos, o runner exigiu `isolated_test`, project ref,
conta sintética allowlisted, modo `outbox_only`, Redis vazio e confirmações
vinculadas aos três alvos.

A migration aditiva
`202610090002_lote2_crm_appointment_cancellation.sql` cria somente a RPC de
cancelamento solicitado pelo CRM. Ela preserva `tool_invocation_id`, cancela
comparecimento/lembretes e não encerra nem recria o bloco do agendamento.

Passaram sete cenários: identidade, deduplicação da timeline, pausa manual sem
remover handoff/agendamento, resolução e retomada separadas, cancelamento com
proveniência preservada, no-show e resultado incerto sem projeção ou retry. Um
evento de agendamento recebido depois do término é registrado no Frappe sem
recriar pausa expirada. A limpeza removeu somente os recursos runtime do
manifesto no Frappe e no Supabase; o Redis terminou com zero chaves.

## 6. Riscos e pontos a conferir no preflight

- O schema real de `lexia_mensagens`, `lexia_handoffs` e `lexia_contactos`
  não está versionado. O preflight lista colunas, constraints e gatilhos;
  qualquer `NOT NULL` sem default ou check incompatível com `origem =
  'omnichannel_v2'`, `prioridade` ou `recebida_na_pausa` bloqueia a aplicação.
- `alter table` em `lexia_mensagens` toma lock exclusivo curto e valida a FK
  e os checks numa varredura (todas as linhas nulas). Aplicar em janela de
  baixo tráfego; o índice parcial é criado sem `concurrently`.
- `lexia_outbound_actions.content` guarda texto da resposta (dado pessoal).
  Falta definir retenção.
- A detecção de eco da IA pelo ID do provedor depende do adaptador consultar
  `lexia_outbound_actions`; na Meta, o eco pode chegar antes do ID ser
  gravado. Fica pendente para o adaptador real.
- O workflow de lembretes precisará da conversa e da referência central do
  agendamento; hoje ele lê o Supabase privado por telefone.
- Os valores de prazo humano e janela do buffer da Detail são desconhecidos:
  o seed exige que sejam informados.

## 7. Ordem segura depois da revisão

1. Revisar os arquivos e este documento.
2. Validar localmente os scripts e o harness em `supabase/isolated/lote2/`.
3. Validar conectividade Supabase e Redis sem SQL ou escrita e apresentar o
   destino sanitizado para confirmação.
4. Rodar o bootstrap preflight somente leitura; qualquer dado ou tabela
   inesperada interrompe o ensaio.
5. Concluído: aplicar baseline, migrations, fixtures e verify somente no
   projeto descartável.
6. Concluído parcialmente: executar cenários sequenciais com duas empresas e
   reprojeção Redis; ainda faltam corridas reais, TTL e recuperação de processo.
7. Concluído parcialmente: Frappe em `outbox_only` e adaptadores falsos passaram
   contra o central; nenhum n8n ou provedor participou.
8. Próximo gate: validar os seis workflows inativos no n8n de teste com
   credenciais falsas e fixtures, antes de discutir canal, piloto ou staging.

## 8. Fora deste pacote

Interface, Server Actions, Redis, n8n real, adaptadores, cérebros, tools,
lembretes e follow-ups reais, staging e produção.
