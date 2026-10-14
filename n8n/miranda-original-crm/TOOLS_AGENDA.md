# Tools originais Miranda / Google pessoal de teste

Para o PRIMEIRO ensaio apenas de disponibilidade, use a variante simplificada
de 17 nodes e os tres arquivos readonly, nao os exports de criacao abaixo.
O CRM HML ja seleciona test_read_only; OAuth/vinculacao n8n seguem manuais.
Essa variante admite ID pessoal exato, sem escrita e sem nova migration.
Guia atualizado: AGENDA_SOMENTE_LEITURA.md.

## Entrega Local (12/10/2026)

| Arquivo | Base original | Copia |
| --- | ---: | ---: |
| `availability-original-crm.inactive.json` | verificar_disponibilidade, 7 nodes | 26 nodes |
| `create-appointment-original-crm.inactive.json` | criar_agendamento, 24 nodes | 55 nodes |

Os nomes e blocos de negocio originais permanecem. Acrescentaram-se guards,
identidade HML, recibos tipados e ledger de idempotencia. Tudo INATIVO para
importacao manual; nenhum n8n, Supabase, Redis, Google ou CRM foi acessado ou
alterado nesta rodada. Estes arquivos contem nodes REAIS de Google Calendar;
nao sao simulacoes quando configurados/autorizados. Fixtures locais e testes
nao conectam esses nodes a servicos.

Gerador: `scripts/build-miranda-original-calendar-tools.mjs`.
Runtime puro: `scripts/lib/miranda-calendar-tools-runtime.mjs`.
Contrato provisorio: `contracts/omnichannel/v1/tool-result.schema.json`.
Testes: `tests/miranda-original-calendar-tools.test.mjs`.
Luxon 3.7.2 foi adicionado SOMENTE como dependencia de desenvolvimento para
exercitar os mesmos DateTime dos Code originais; o n8n usa seu Luxon nativo.

## Regras Preservadas E Corrigidas

- America/New_York, amanha ate 60 dias, domingo fechado, grade de 30 minutos
  e margem de 15 minutos entre atendimentos do mesmo profissional.
- Samuel em dias uteis: inicio 3:30 PM a 7:00 PM; ter/qui fim ate 7:30 PM;
  demais dias fim ate 8:00 PM. Bruna e sabado mantem as janelas originais.
- Sabado antes de 10 AM encaminha para equipe, sem negar nem confirmar reserva.
- Escolha explicita de variantes, massagem 60/90 e laser: uma area usa a
  duracao cadastrada; duas somam; tres ou mais usam 60 min; corpo inteiro 150.
- Servicos que exigem avaliacao continuam direcionados para ela. Catalogo
  sem a avaliacao obrigatoria agora falha, em vez de agendar o tratamento.
- Nome completo/telefone, recapitulativo entregue e OK explicito antes de criar.
- Confirmacao pt/en/es e preparo para laser preservados do Montar Confirmacao.
- Alternativas apos conflito agora reaplicam janelas do Samuel/dias bloqueados
  e mostram AM/PM. Antes de criar uma alternativa, consultar disponibilidade
  novamente para obter um slot atestado; validade do atestado: 15 minutos.
- Datas impossiveis, 24:00 e horas AM/PM invalidas sao rejeitadas sem normalizar.
- Eventos all-day e sem dono identificado bloqueiam ambos os profissionais;
  cancelled/transparent nao bloqueiam. Recorrencias devem vir expandidas.
- Leitura falha/incompleta nunca e convertida em calendario vazio/livre.

Notificar Samuel/Socio, Pausa Eterna WhatsApp e Encerrar Follow-up permanecem
visiveis numa faixa de referencia, desabilitados/desconectados e sem HTTP,
Redis ou escrita no Supabase privado. Criacao devolve evento ao Omnichannel;
notificacoes, pausas, follow-ups, lembretes e pipeline continuam separados.

## Configurar Sem Atingir Producao

1. Importe os DOIS arquivos como novas copias na pasta CRM MIRANDA SKIN.
   Nao substitua as tools Miranda ativas. Nao ha webhook/schedule nestas tools.
2. Na sua conta Google, crie um calendario SECUNDARIO chamado Lexia Testes.
   Nas configuracoes dele, em Integrar agenda, obtenha o ID terminado em
   `@group.calendar.google.com`. A agenda principal (`primary`) e recusada.
   Seu calendario pessoal padrao pode continuar intacto.
3. Crie/selecione uma credencial Google Calendar OAuth2 da SUA conta pessoal,
   com referencia `LEXIA - Google Agenda Pessoal TESTE`. Nunca escolha a
   credencial de producao da clinica. Nao colocar tokens nos Set/Code/JSON.
4. Em `Config Tools Lexia` dos dois arquivos, configure:
   environment=isolated_test; cliente_slug/account_ref iguais ao CRM/cerebro;
   project_ref do Supabase CENTRAL HML; calendar_id E expected_calendar_id com
   o mesmo ID secundario. Deixe timezone=America/New_York para reproduzir as
   regras Miranda. Seu Google pode exibir outro horario se a UI estiver em
   fuso brasileiro; compare o instante, nao so o relogio exibido.
5. `protected_calendar_hashes` vem gerado do original: NAO editar/remover.
   O Postgres compara fingerprints SHA-256 e recusa o calendario original
   mesmo se alguem o selecionar por engano. Nao inclui seu ID em texto puro.
6. `Get many rows`: somente consulta `servicos_miranda`. Se usar catalogo
   Miranda real, selecione acesso efetivamente restrito a leitura, nao apenas
   uma credencial cujo NOME diga isso. Nenhum node Supabase escreve nesta copia.
7. Nodes Postgres: usar SOMENTE `Lexia HML Central Postgres`, do projeto
   descartavel autorizado. Identidade, conta fake/ativa e empresa ativa sao
   verificadas antes de operacoes. Nao usar Postgres Miranda de producao.
8. Revisar/aprovar o schema local
   `supabase/isolated/lote2/202610120001_calendar_tools.sql`. Ele NAO foi aplicado.
   Requer GUC `lexia.target_project_ref`, marcador descartavel e baseline Lote 2.
   Sem a tabela/RPCs novos, o fluxo para antes de consultar/criar no Google.
9. Somente depois da conferencia, marcar calendar_reviewed/allow_calendar_read.
   Na criacao, allow_calendar_write exige aprovacao propria; a permissao do
   caller tambem deve ser true. Ligacao/credenciais nao representam homologacao.

Todos os campos de destino/comportamento vem do Set confiavel, nunca do lead.
Nao teste clicando isoladamente no node Create an event; execute o fluxo completo.
Os defaults vazios/false sao intencionais e impedem chamadas acidentais.

## Ligar Ao Cerebro E Ao CRM

Foi gerada uma revisao COMPATIVEL do cerebro, com os mesmos 51 nodes/regras:
`MIRANDA-CEREBRO-LEXIA-CRM-COMPATIVEL-TOOLS.json` na pasta Downloads.
Ela acrescenta captured_state, permissao de leitura/escrita e prova do ultimo
recapitulativo ENTREGUE a lexia_call_context. Nada disso e `$fromAI`.
O envelope externo usa status succeeded/failed/unknown; status comercial fica
em data.status (OK/CRIADO/CONFLITO/JA_AGENDADO etc.).

No Config Cerebro Lexia, os aliases availability_workflow_ref e
create_appointment_workflow_ref precisam conter os IDs das NOVAS copias.
protected_tool_fingerprints bloqueia os IDs originais conhecidos; nao editar.
E somente denylist de seguranca contra enganos, nao autenticacao nem chave
idempotente. Os efeitos usam SHA-256 no Postgres, nao esses fingerprints.
calendar_tools_reviewed so deve ser true apos revisao das duas copias.
Credenciais/tabelas de memoria privadas do cerebro continuam requisitos
separados, conforme CEREBRO.md; nao conectar a escrita de memoria a producao.

IMPORTANTE: o Omnichannel/Frappe atual ainda envia tools_permitidas=false e
calendar_access=disabled. Nao basta preencher IDs ou ativar estas duas tools.
Para autorizar teste REAL de Google, a proxima etapa deve adaptar o corredor
do CRM/Omnichannel para derivar permissao da politica server-side revisada:

- requisicao full_agent_virtual e tool_policy.calendar=test_read_only/read_write;
- tools_permitidas=true e calendar_access=isolated_test somente no ambiente fake;
- calendar_write_allowed=true somente para test_read_write explicitamente aprovado;
- interfaces/retornos devem declarar calendario REAL DE TESTE, nao prometer
  ausencia de todo efeito externo enquanto um evento Google realmente foi criado.

Esta rodada nao habilitou esses flags nem alterou UI, servidor ou Omnichannel.
Depois disso, disponibilizar as versoes das tools para Execute Workflow
conforme a versao instalada do n8n, sem ligar canais/schedules de producao.

O recapitulativo deve incluir servico, profissional, dd/MM, h:mm AM/PM, nome
e telefone; confirmar por sim/yes/si. Uma mudanca de dados exige novo recap.
Segundo agendamento exige pergunta/confirmacao de manter os dois, conservando
o primeiro. Remarcacao/cancelamento seguem encaminhamento humano original.

## Idempotencia E Incerteza

O ledger `lexia_calendar_tool_calls` liga request, escopo, invocacao, calendario
e ID fixo do evento. Cache so devolve recibo da mesma origem. A reserva de
escrita e adquirida ANTES de reler duplicidade/ocupacao; nao se usa uma leitura
antiga depois de esperar por outra criacao. Claim unico por calendario e token
de ownership impedem um concorrente de encerrar o claim de outro.

Gate de versao/epoch, lote, cutoff/fencing, projecao e pausas e repetido antes
do Create an event. Intervencao aceita antes desse gate impede criacao.
Intervencao depois do gate pode ocorrer com o efeito externo ja em andamento;
nao promete desfazer uma reserva criada. Google e banco nao sao uma transacao.
Edicoes manuais/outros sistemas no calendario continuam uma corrida externa
que o lock local nao controla; precisam de ensaio e monitoramento reais.

ID deterministico e suportado pelo [node nativo n8n](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Google/Calendar/EventDescription.ts)
e pelo [Google events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).
Eventos de teste sao privados, sem convidados, convites/e-mails, lembretes
Google padrao ou PII no titulo/descricao. IDs/calendario Google nao vao no
evento de dominio: a referencia publica e caltest:<UUID do ledger>.

Timeout, ID/intervalo/marker inesperado ou resposta incompleta da criacao
produz unknown. Falha de banco depois do Google conserva claimed. Ambos
bloqueiam novos writers do calendario e NUNCA expiram para permitir reenvio.
Reconciliacao ainda e manual/revisada: consultar o ID fixo/tag
LEXIA_TEST_CALL, conferir evento e intervalos e persistir o resultado pelo
caminho administrativo futuro. Nao apagar o claim para "tentar de novo".
Nao ha reconciliador automatico pronto nesta entrega.

O ledger tem RLS e acesso server-side. Contem args/confirmacao de conversas de
TESTE; definir retencao/exclusao antes de ampliar uso. Excluir manualmente um
evento no Google nao apaga auditoria nem equivale a cancelamento espelhado.

## CRM, Pausas E Lembretes Ainda Pendentes

O recibo duravel comprova o efeito Google e retorna appointment.confirmed ao
cerebro/mestre. Nao chama diretamente a RPC de pausa. O Omnichannel ainda deve
consumir/persistir o evento atestado, aplicar politica de agendamento e liberar
a unica confirmacao terminal, sem autorizar respostas obsoletas gerais.
Sem essa etapa, um texto confirmado no chat nao implica agenda, pipeline,
pausa ou lembrete atualizados no CRM. Cancelamento deve espelhar evento e negar
lembretes sem recriar/remover outras pausas. Nenhum desses efeitos foi fingido.

## Checks Locais

Executar `npm run test:miranda:calendar:local`, a suite combinada dos originais,
`npm run test:lote2:local`, lint focado e `npm run typecheck`.
Os doubles exercitam os Code/IF/fluxos originais com Luxon real, mas banco e
Google sao simulados. Nao validam SQL em Postgres, OAuth, nodes reais instalados,
concorrencia remota ou integracao CRM ponta a ponta. Build Next nao e necessario:
nao houve mudanca de UI. Resultados finais registrados em Agent.MD/PLAN.MD.

Resultado em 12/10: 38 testes novos das tools; 70 direcionados incluindo
cerebro; 201/201 combinados; 193/193 Lote 2; lint e typecheck passaram.
SQL foi somente inspecionado em arquivo: nenhuma funcao/tabela foi criada
ou exercitada num Postgres real. OAuth/Google/n8n/CRM continuam sem ensaio real.
`npm audit` da arvore local reportou 15 avisos (2 moderados, 12 altos, 1 critico),
sem advisory para Luxon. Nao houve audit fix, atualizacao do app ou deploy;
revisar essas dependencias separadamente antes de publicar a plataforma.
