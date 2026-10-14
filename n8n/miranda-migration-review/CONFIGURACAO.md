# Configurar Uma Vez, Testar Aos Poucos

## Corredor Ja Configurado Em 12/10

Nao e necessario reimportar nem preencher credenciais para o primeiro texto:
01/02 ja estao publicados e o Agent Test HML aponta para eles. Abra
http://crm-hml.localhost:18080/crm/agent-test, crie conversa NOVA e selecione
WhatsApp (virtual, sem numero conectado). Texto, contexto, memoria e buffer
passaram no runtime. "Suprimida" no balao significa que o envio externo foi
bloqueado; a resposta virtual foi exibida no CRM.

02 usa memory_backend=central, central_project_ref do novo projeto e
catalog_read_only=true. private_project_ref fica vazio: nao ha novo banco
privado de memoria a criar. Os quatro nodes com "memoria privada" no nome
mantem os nomes legados, mas usam RPCs Postgres OPERACIONAIS no central.
Seis consultas comerciais GET usam a credencial privada existente Miranda.
Nao trocar a credencial desses GETs por central nem usa-la em writes.

O roteiro abaixo descreve o pacote ANTERIOR e as fases ainda nao habilitadas.
Nao ativar Google, providers ou schedules so porque o teste de texto passou.
Estado atual: ../../docs/MIRANDA_MEMORIA_CENTRAL_CRM_20261012.md.

Nenhum SQL, servico ou workflow foi executado/publicado nesta rodada.
Copias inativas; Miranda ativa permanece intocada. Os seis arquivos sao
objetos JSON completos, mas ainda precisam de instalacao/configuracao e ensaio
no runtime real. As lacunas do MANIFEST nao devem ser escondidas por flags.

## Ordem

1. Conferir o schema instalado no central antes de revisar/aplicar SQL 001-004
   em review/miranda-migration e baseline Lote 2/202610090001-002 necessarios.
   Nenhuma aplicacao foi autorizada/executada nesta rodada. Nao usar scripts
   descartaveis de bootstrap/seed/cleanup: os recursos sao persistentes.
2. Usar memoria operacional central por escopo e catalogo/playbook privado
   somente em leitura (decisao posterior aprovada). Nao instalar tabela nova
   no privado ativo da Miranda. project_ref identifica projeto, nao descarte.
3. Instalar os arquivos Frappe revisados junto dos DocTypes: integration.py,
   commands.py, workflow_tests.py, migration_commands.py, migration_pipeline.py,
   Lexia Handoff (block opcional), Lexia Appointment (confirmed_at). Fonte local
   preparada, nao instalada. Nao inventar confirmed_at de registros antigos.
4. Importar somente os seis JSONs desta pasta uma vez, como COPIAS.
   Configurar modelos nativos e Supabase/Postgres/Redis central e privado.
   Postgres: SSL Require, verificacao ligada e CA confiavel; Redis: TLS.
   Segredos somente em credenciais/configuracao server-side, nunca no CRM/browser.
5. Usar tenant ativo/conta fake do canal escolhido e politica/contexto registrados
   no central. Mesmo environment/cliente_slug/UUID de conta em todos os Sets e
   no servidor CRM. Nao presumir que os defaults estao cadastrados no banco.
6. Preencher os aliases IMPORTADOS nas ligacoes abaixo. Nao selecionar workflow
   ou tool original de producao. Fingerprints recusam destinos originais.
7. Configurar o alvo do Agent Test server-side e publicar somente as copias
   necessarias para o webhook/chamadas internas, conforme a versao do n8n.
   Entradas WhatsApp/Meta e schedules permanecem disabled. Nao alterar producao.
8. Conversa ficticia NOVA no Agent Test: texto, duas mensagens seguidas, contexto,
   perguntas respondidas, pt/en/es e troca de idioma sem reapresentacao. Depois
   disponibilidade; so depois revisar criacao/cancelamento/automacoes.

## Sets E Aliases

| Onde | Preencher |
| --- | --- |
| 01 / Config Cliente Lexia | tenant, environment, test_account_ref, brain_workflow_ref=ID do 02, frappe_url |
| 01 / CENTRAL DE CONTROLE | cerebro_teste_revisado apos revisar; manter envio real e notificacoes false |
| 01 / OPERACAO Configuracao | mesmo tenant/environment, account_refs=[UUID], crm_event_endpoint completo |
| 01 / Config Entrega Compartilhada | mesmo tenant/conta/projeto; delivery_mode=virtual |
| 02 / Config Cerebro Lexia | memory_backend=central, central_project_ref, catalog_read_only=true, tenant/conta, revisao de modelos/dados; aliases de 05/06 apenas na fase Google |
| 03 / Config Follow-up | mesmo tenant/conta/projeto; delivery_workflow_ref=ID do 01; preview primeiro |
| 04 / Config Lembretes | mesmo tenant/conta/projeto; delivery_workflow_ref=ID do 01; preview primeiro |
| 05/06 / Config Tools Lexia | project_ref, tenant/conta, calendar_id=expected_calendar_id; revisao/permissoes |

OPERACAO e um unico Set para projecao, comandos, manutencao e equipe.
Projecao escreve chave imutavel de versao; writer atrasado nao sobrescreve a
versao atual. Gate sempre le o central. Falha Redis nao libera envio.
Manutencao recupera projecao/espelho/notificacoes, nao reseta envio/Google incerto.

## Alvo Do CRM

Configurar no servidor Frappe:
- lexia_workflow_test_mode = remote
- lexia_workflow_test_execution_mode = full_agent_virtual
- lexia_workflow_test_targets.omnichannel = URL HTTPS do novo
  /webhook/lexia-miranda-migration-agent-test (nao /webhook-test)
- lexia_workflow_test_allowed_hosts = host aprovado do seu n8n
- lexia_workflow_test_bearer_token = segredo exclusivo do teste
- lexia_workflow_test_calendar_access = disabled inicialmente

O mesmo segredo vai na credencial Header Auth de LEXIA Webhook Teste Frappe:
Authorization: Bearer <segredo>. O browser nao recebe o token.
Nao foi feita troca do alvo no CRM instalado nesta rodada.

## Seu Google Agenda

Nos nodes Google Calendar dos arquivos 05/06, selecionar a credencial
Lexia Google Agenda Migracao autenticada na sua conta, nunca na da clinica.

Primeiro leitura: allow_calendar_read=true, calendar_reviewed=true no 05,
allow_calendar_write=false, ID exato igual a expected_calendar_id. Para agenda
pessoal, allow_personal_calendar_read=true no 05. "primary" nao e aceito.
Frappe calendar_access=test_read_only; 01 permitir_tools_teste=true;
02 calendar_tools_reviewed=true com ID correto do 05. Agenda Miranda protegida.

Depois escrita: criar calendario SECUNDARIO proprio, usar o mesmo ID
@group.calendar.google.com em 05 e 06. Habilitar allow_calendar_write no 06,
permitir_criacao_agenda_teste no 01, Frappe test_read_write e
lexia_workflow_test_calendar_write_enabled=true somente apos revisao.
As reservas sao REAIS nesse calendario, embora mensagens so aparecam no CRM.
Retorno declara calendar_write_attempted; erro incerto nao informa falsa ausencia
de escrita. Nao repetir criacao/DELETE para resolver timeout.

Cancelamento: mesmo ID no Set CANCELAR Configuracao confiavel, habilitar apos
revisao; OPERACAO appointment_workflow_ref=ID do 06 e actor_user_id existente no
central. CRM exige command token exclusivo, dispatcher/integration user autorizado
e endpoint /webhook/lexia-miranda-migration-commands. Solicitado/unknown bloqueia
lembretes, mas nao significa Google cancelado. Confirmacao exige comprovacao.

## Pipeline E Diagnostico

Instalar helper, mapear lexia_migration_pipeline_statuses por CRM Lead/CRM Deal
para Status NATIVOS existentes e so entao habilitar lexia_migration_pipeline_enabled.
Etapas: Novo lead, Conversa ativa, Agendado, Em follow up, Follow up recuperado,
Follow up convertido. Mensagem realmente enviada + resposta posterior + criacao
confirmada sao provas separadas. Isso e atribuicao temporal, nao causalidade de Ads.
Presenca/no-show e fato do operador, nunca inferido pelo modelo.

configure_*: conferir Set e alias importado; *_scope_mismatch: comparar escopo;
context_config_unavailable: conferir unica configuracao, nunca inserir fallback;
redis_projection_failed: conferir TLS/outbox, nunca desabilitar gate;
confirmation_request_state_mismatch: pedido/recibo divergentes, nao copiar versao;
unknown/delivery_unknown: reconciliar identidade, nao reenviar;
crm_outbox_retry_conflict: evento mudou, nao trocar ID para esconder o problema.

## Nao Esta Concluido

SQL/n8n/Google/modelo/CRM reais nao foram ensaiados. Permanecem pendentes antes
dos canais: Meta assinado/entrega comum, graduacao production, answer_pending
automatico, recovery de batch claimed, filtros/ramo rapido, atribuicao duravel
de campanhas e upload completo no Agent Test. Manter await_new_message.
Notificacoes/cron/canais desligados nos primeiros testes; UAZAPI/Z-API exigem
destinos confiaveis e ensaio de recibos reais. README/MANIFEST/RESULTADOS detalham
os limites. Nenhuma destas pendencias deve ser marcada como homologada por testes
com doubles. Ajustaremos nodes nos mesmos workflows, nao outra familia de imports.
