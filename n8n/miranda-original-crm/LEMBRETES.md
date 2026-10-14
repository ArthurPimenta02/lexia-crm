# Miranda: Lembretes Originais / Entrega Compartilhada

## Estado

`reminder-original-crm.inactive.json` adapta o export original de sete nodes,
preservando os sete nomes e as regras deterministicas. Possui 31 nodes com
tres notas, sem modelo de IA, credencial de canal ou consulta Google.
Importa inativo, modo preview, schedule desligado. Nao houve acesso a n8n,
SQL, Redis, Supabase, Frappe, provedores ou producao nesta rodada.

Usar com o NOVO `omnichannel-shared-delivery.inactive.json` desta rodada:
o receptor tambem revalida janela, horario e unicidade antes do claim/envio
virtual. O follow-up compartilhado anterior continua compativel.
Contratos permanecem provisorios para runtime real.

## Original e adaptacao

| Node original | Responsabilidade atual |
| --- | --- |
| Intervalo 1h | Mesmo schedule de hora em hora; desabilitado ate ensaio |
| Config Lembretes | Set confiavel de ambiente/tenant/conta e referencia do Omnichannel; sem tokens |
| Buscar Consultas Proximas | Postgres nativo no central, filtrado por ambiente/empresa/conta, nao banco privado por telefone |
| Travas de Lembrete | Confirmado, unico, 2h-24h, 7h-20h Boston todos os dias, idioma do lead, bloqueios independentes |
| Enviar Lembrete | Execute Workflow nativo para a COPIA do Omnichannel; sem envio direto |
| Marcar Lembrete Enviado | Postgres nativo confere acao sent e mensagem persistida; nao escreve flag otimista |
| Pausa Eterna (Lembrete) | Nome visual conservado, agora pass-through; nunca cria/renova/remove pausa |

O loop processa uma consulta por item. Credenciais sao apenas referencias por
nome; nenhum valor/ID original foi copiado. Supabase nativo confere a identidade
da API, e Postgres confere a identidade, busca com JOIN por conta, revalida e
le o comprovante. A busca nao pode misturar contas da mesma empresa.

## Regras da Miranda

- Consulta confirmada, com inicio/fim validos e timezone America/New_York.
- Lembrete unico por escopo/agendamento. Entre 2h e 24h inclusive antes do
  inicio; fora disso nao envia. Nao envia consultas de ultima hora (<2h).
- Das 7h inclusive as 20h exclusive em Boston; domingo continua permitido.
  Intl usa timezone real, incluindo horario de verao, nao offset fixo.
- Templates pt/en/es preservam a intencao do original, com hoje/amanha e
  formato de hora adequado. Idioma atual do contexto da mesma conversa ganha
  do idioma antigo do agendamento; idioma ausente bloqueia, sem fallback en.
- Telefone valido e exigido somente para WhatsApp real. Meta usa identidade
  opaca; conta fake nao inventa telefone.
- Pausa do PROPRIO agendamento confirmado permite seu lembrete. Pausa manual,
  intervencao humana, handoff, legacy_import e OUTRO agendamento bloqueiam.
- Cancelamento impede lembretes, mas nao encerra/recria a pausa, mesmo quando
  a pausa foi removida/expirou. Lembrete tambem nao altera essa pausa.
- comparecimento/no-show continuam fatos informados pelo CRM, nao inferidos
  de resposta ao lembrete. Pedido de confirmacao de presenca nao muda status.

A antiga flag `lembrete_enviado_em` do banco privado nao e usada como prova
nova. O livro central sent + provider_message_id + mensagem correlacionada
passa a ser a prova de envio. Nao existe escrita no Supabase privado aqui.

O schema central de agendamento ainda nao contem servico/nome atestados por
evento. O template usa "sua consulta/tu cita/your appointment" e, quando
disponivel, primeiro nome do contacto central; nao substitui o servico por
interesse recente da conversa. Para preservar personalizacao de servico,
evoluir contrato/mirror da tool em revisao separada, sem copiar estado privado.

## Fonte, IDs e erros

Hierarquia: configuracao confiavel -> identidade descartavel -> agendamento
central atestado -> conversa/conta -> contexto/idioma -> proposta -> gate
compartilhado -> efeito confirmado -> evento CRM.

O pedido e `lexia.automation.delivery.request.v1`, com request interno
`lexia.automation.request.v1`, kind appointment_reminder, source_ref do
agendamento e uma acao text. Nao recebe recipient/URL/credencial e nao leva
lead_cutoff_seq; mensagem nova do lead nao cancela lembrete por si so.
due_at e inicio menos 24h, nao o instante mutavel do schedule.

IDs deterministas derivam de tupla JSON de escopo completo + appointment_ref,
nao de horario da execucao, estado ou texto. Qualquer acao anterior do mesmo
agendamento (prepared/claimed/sent/failed/unknown/suppressed) impede regenerar
outro lembrete. Mudanca de horario apos preparar exige recuperacao/revisao
explicita; nao inventar outro ID para vencer conflito. Remarcacao precisa de
contrato de tool que distinga o evento cancelado da nova confirmacao.

O produtor verifica estado/idioma/horario/fila antes de chamar. O receptor
verifica novamente no claim sob lock: janela, horario Boston, due_at correto,
cancelamento e outra reserva/envio incerto/confirmado do mesmo agendamento.
Cada permissao posterior continua sujeita aos outros bloqueios. Regras aqui
sao da copia Miranda; outro cliente nao deve herda-las implicitamente.

Timeout/erro do subworkflow, recibo divergente ou sent sem comprovante nao
marcam enviado. Resultado incerto exige reconciliacao, nunca retry automatico.
Se o recibo se perdeu mas o livro + mensagem confirmam a MESMA acao, o produtor
pode recuperar a confirmacao sem novo envio. Falha da leitura do livro tambem
e incerta, nao sucesso. Nodes nao possuem retry automatico.

Preview nao chama Omnichannel nem grava sent. Entrega virtual usa conta fake,
conversa test: e checkpoint suppressed/virtual_delivered; e exibicao de teste,
nao envio real nem motivo para incrementar metricas. Eventos
automation.updated/message.recorded sao preparados com contratos existentes;
message.recorded exige prova. Transporte/outbox/replay Frappe ainda nao foram
conectados: nao apresentar `crm_delivery_pending` como espelho concluido.
Ao implementar replay, preservar o envelope original completo, sem mudar
timestamps/payload sob o mesmo event_id.

## Configuracao no n8n

1. Importar lembretes e Omnichannel atualizado como novas copias, inativas.
   Nao substituir workflows Miranda nem selecionar credenciais de producao.
2. Selecionar `LEXIA - Postgres Central Lote 2 TESTE` e
   `LEXIA - Supabase Central Lote 2 TESTE`, do MESMO projeto descartavel.
   Os dois marcadores lexia_environment_identity precisam coincidir.
3. No Config Lembretes: isolated_test, cliente_slug sintetico, account_ref
   central e test_project_ref iguais ao Config Entrega Compartilhada.
   Falta de configuracao bloqueia. Nao preencher tokens nesse Set.
4. Comecar preview + Teste Manual, schedule desligado. Confirmar que consulta
   sintetica central tem escopo, source_ref, intervalo e contexto pt/en/es.
5. Para testar a entrega virtual: delivery_workflow_ref = ID da nova copia
   do Omnichannel; delivery_contract_reviewed=true apos revisao;
   delivery_mode=shared_delivery. Omnichannel continua virtual, conta fake.
   Execute Workflow nao usa webhook-test nem token de provedor no produtor.
6. Conferir no n8n a versao dos nodes, passThrough, item linking e retorno
   do loop; SQL e autochamada do Omnichannel ainda precisam de ensaio isolado.

## O que falta para testes reais

**Primeiro, chat na plataforma:** selecionar cerebro/modelos/memoria de teste;
conferir prompt/schema e RPCs do central, Redis exclusivo e Header Auth do
webhook de teste. Configurar servidor Frappe para a nova URL e modo
full_agent_virtual. Ver README.md para nomes exatos das configuracoes. Importar
JSON nao conecta o CRM por si so; esta rodada nao alterou esses destinos.

**Depois, agendamento e automacoes pela plataforma:** adaptar/verificar os
originais de criar_agendamento, verificar_disponibilidade e cerebro para
Google Agenda pessoal EXCLUSIVO de teste, com leitura/escrita separadas.
Confirmacoes e cancelamentos reais da tool devem espelhar eventos atestados
no central: o lembrete nao vai buscar automaticamente a tabela privada antiga.
Preparar fixtures e conferir schema/RPCs existentes, sem migrations cegas.
Criar disparo/consulta de resultados de follow-up/lembrete na area Agent Test
e integrar timeline/outbox de automacoes; o chat atual nao possui esse disparo.
Por enquanto, Teste Manual no n8n e a entrada de ensaio do lembrete.

**Instagram pessoal:** adaptador Meta ainda bloqueado no receptor. Revisar
assinatura, conta, IDs/eco, janela/permissao de mensagem e politica para
lembrete fora da janela. Pausa de agendamento nao vence politica Meta.
Preparar ingresso operacional na copia (hoje chat sintetico) e registro dos
eventos CRM. Nao conectar a pagina/conta Miranda para suprir esses limites.

**WhatsApp de teste:** Z-API preparada, nao homologada. Configurar instancia,
conta central/numero de teste, Client-Token em credencial, ingresso/eco,
delivery_owner/mode e testar pausas/duplicidade/timeout com receptor controlado.
Somente apos esses gates liberar horario automatico na copia. Nunca dois
donos de entrega para uma conta. Recovery/outbox e metricas ainda exigem ensaio.

## Verificacao local

30 novas regressoes de lembrete; 128 testes especificos combinados passaram,
assim como 193 Lote 2, lint focado e typecheck. E2E local usa somente adapters
injetados, nao Supabase/Redis/n8n/modelo/provedor. SQL foi conferido como
configuracao, nao executado; importacao, transacoes e permissao real continuam
pendentes. Next/Frappe nao mudaram: build da plataforma nao foi executado.

Gerador: scripts/build-miranda-original-reminder.mjs.
Logica: scripts/lib/miranda-original-reminder-runtime.mjs.
Queries: scripts/lib/miranda-original-reminder-sql.mjs.
Regressoes: tests/miranda-original-reminder.test.mjs.
Fonte original em Downloads, preservada e fora do repositorio.

```sh
node scripts/build-miranda-original-reminder.mjs '<original-lembretes.json>' n8n/miranda-original-crm/reminder-original-crm.inactive.json
node --test tests/miranda-original-reminder.test.mjs tests/miranda-shared-delivery.test.mjs tests/miranda-original-followup.test.mjs tests/miranda-original-agent-test.test.mjs tests/miranda-original-crm.test.mjs tests/miranda-original-layout.test.mjs
npm run test:lote2:local
npm run typecheck
```
