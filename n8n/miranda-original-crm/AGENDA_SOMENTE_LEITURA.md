# Primeiro teste: disponibilidade no calendario pessoal

## Estado em 12/10/2026

O CRM HML agora seleciona `test_read_only` server-side, somente em
`isolated_test`, modo `remote` e `full_agent_virtual`. Retornos precisam
corresponder a essa politica e declarar `calendar_write_attempted=false`.
`test_read_write` e recusado nesta fase. O badge existente em Agent Test
mostra Calendar read-only; nao houve alteracao do frontend/design.

O helper Python foi atualizado no backend/workers HML e na fonte persistida
em `/opt/lexia-frappe-hml/custom_apps/lexia_crm`. Backend e duas filas Frappe
foram reiniciados apos conferir zero workers ocupados. Nao houve restart,
importacao, publicacao, execucao ou edicao do n8n/Miranda em producao.
A imagem Docker antiga nao foi reconstruida; numa recriacao futura precisa
incorporar a fonte atualizada. Backup de codigo em
`/opt/lexia-frappe-hml/provenance/calendar-readonly-20261012`; backup privado
do site_config no proprio site, sem segredos neste documento.

Os workflows NOVOS foram gerados localmente, nao importados. Portanto o CRM
esta preparado, mas o teste ponta a ponta depende da ligacao manual abaixo.
Origem autorizada e autenticacao do CRM existentes foram preservadas. O target
omnichannel usa agora o path dedicado /webhook/lexia-miranda-crm-agent-test-readonly-v3.
Ate importar/publicar essa COPIA HML, o teste recebe endpoint ausente; nao
reaponta nem reativa Miranda de producao para resolver isso.

## Quais arquivos usar

Pasta Downloads: `LEXIA-AGENDA-SOMENTE-LEITURA`.

1. `availability-readonly-crm.inactive.json`: disponibilidade, 17 nodes.
2. `brain-readonly-crm.inactive.json`: inteligencia original, 51 nodes;
   `criar_agendamento` desabilitada e desconectada.
3. `omnichannel-readonly-crm.inactive.json`: base original com buffer, midia,
   contexto, historico e entrega comum, 258 nodes; permite somente leitura
   pelo chat virtual. Provedores/canais reais continuam desligados.

Os arquivos canonicos sem destino pessoal estao neste diretorio. Apenas a
copia em Downloads recebe o ID pessoal explicitamente fornecido e o project_ref
HML; nenhum token/credencial e incorporado. Os exports de criacao anteriores
nao devem ser usados nesta fase.

## Simplificacao e limites

Disponibilidade nao reserva escrita, cria evento, grava ledger de criacao ou
trata criacao incerta. Uma consulta Postgres SELECT confere identidade do banco,
conta fake/empresa ativa, escopo completo, calendario original proibido,
politica ativa, versao/epoch, projecao, lote/fencing/cutoff e todos os bloqueios.
Falha de banco/Google nunca e interpretada como agenda livre.

O ID do recibo usa SHA-256 do pedido completo e calendario, sem concatenacao
ambigua. O recibo vai ao cerebro; auditoria/resultado seguem pela memoria HML.
Repetir uma leitura nao cria duplicacao de eventos. Nao ha ledger duravel
central especifico dessas consultas. Esta consulta NAO fornece o atestado
exigido pela fase futura de criacao; nessa fase usa-se consulta/ledger de
escrita revisados e nova aprovacao. A entrega da resposta continua revalidada
no Omnichannel apos o processamento. Nao houve nova migration nesta rodada.

Calendario principal pode ser consultado SOMENTE pelo ID exato autorizado,
com allow_personal_calendar_read=true e permissao de escrita=false no Set
e caller. Alias ambiguo `primary` e recusado. Criacao continua exigindo agenda
secundaria de teste. O OAuth pode conceder permissoes mais amplas que o fluxo:
somente leitura aqui e uma restricao do workflow, nao promessa sobre o escopo
que o Google apresenta na tela de consentimento.

## Onde conectar o Google

1. Importe disponibilidade como NOVA copia em CRM MIRANDA SKIN; nunca abra
   a tool Miranda de producao para substituir seu JSON.
2. Abra o node original `Get many events`.
3. Em Credential to connect with, crie uma credencial Google Calendar OAuth2
   API exclusiva, `LEXIA - Google Agenda Pessoal TESTE`.
4. Sendo n8n self-hosted, configure um projeto Google Cloud com Calendar API
   habilitada. Configure OAuth/app externo de teste e inclua sua conta em Test
   users. Crie OAuth Client do tipo Web application.
5. Copie OAuth Redirect URL da credencial n8n para Authorized redirect URIs
   do OAuth Client Google. Cole Client ID/Client Secret SOMENTE na credencial
   n8n; clique Sign in with Google, selecione sua conta e salve.
6. Em `Config Tools Lexia`, calendar_id e expected_calendar_id ja estao
   preenchidos na copia Downloads com o ID da foto. Nao e a URL publica/ICS;
   nao tornar agenda publica. calendar_reviewed/allow_calendar_read=true,
   allow_calendar_write=false. protected_calendar_hashes nao deve ser removido.
7. `Get many rows`: catalogo `servicos_miranda`, somente leitura. Nodes
   Postgres: credencial `Lexia HML Central Postgres`, NUNCA a da Miranda.

Guia oficial OAuth:
https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/

## Ligar cerebro e omnichannel

1. Importe o cerebro SOMENTE LEITURA como copia HML. Em `Config Cerebro Lexia`,
   availability_workflow_ref recebe o ID da NOVA disponibilidade. Nao precisa
   preencher create_appointment_workflow_ref nesta fase. calendar_read_only=true.
2. Configure modelos e catalogo/playbook; selecione credencial PRIVADA HML
   nos nodes `lexia_brain_identity`/`lexia_brain_memories`. O cerebro ESCREVE
   memoria: nao conectar esses nodes ao Supabase Miranda de producao.
   private_project_ref/private_data_reviewed/models_reviewed precisam conferir
   com o ambiente isolado. Consulte CEREBRO.md para tabelas/constraints.
   Se nao existirem, parar e preparar schema revisado no HML, nao contornar
   identidade nem usar tabelas de producao. Nenhum schema privado foi aplicado aqui.
3. Depois de revisar a disponibilidade, calendar_tools_reviewed=true.
   Nao reabilitar `criar_agendamento`; ela nao tem conexao ai_tool.
4. Importe/atualize SOMENTE a copia HML do omnichannel. Selecione o novo
   cerebro em `Chamar Cerebro do Cliente`, pelas configuracoes/ID do node.
   Configure Postgres/Supabase/Redis de teste; nunca selecionar credenciais de
   producao. cerebro_teste_revisado=true somente apos conferencia do cerebro.
5. CENTRAL DE CONTROLE: agenda_somente_leitura_revisada=true e
   permitir_tools_teste=true nessa copia; permitir_envio_real=false e
   permitir_notificacao_handoff=false. Payload SEMPRE calendar_write_allowed=false.
6. Webhook Teste Frappe: credencial `LEXIA - Agent Test Frappe`, mesma
   autenticacao ja usada pelo CRM HML. Publique somente a copia com o webhook.
   Tools/cerebro sao subworkflows: disponibilize versoes conforme a versao n8n,
   sem ativar schedules nem webhooks WhatsApp/Meta.
7. Production URL do novo webhook deve terminar em
   /webhook/lexia-miranda-crm-agent-test-readonly-v3, na MESMA origem autorizada
   que o CRM ja usava. O target HML foi preparado para esse path exclusivo;
   mantenha apenas UM webhook com esse path. Nenhuma URL de producao Miranda
   foi alterada. Se houver divergencia de host/path, parar e conferir.

## Primeiro ensaio

No CRM, abra Agent Test e uma conversa NOVA. Escreva, por exemplo:
"Quais horarios tem para avaliacao com Samuel amanha?".
Confira no n8n que a execucao chamou o cerebro e esta disponibilidade, e que
Get many events executou em seu calendario. Conferir regra America/New_York
(Boston), nao confundir com o fuso de exibicao do seu Google.

Para provar ocupacao, crie MANUALMENTE no Google um evento ficticio num horario
e repita a consulta em nova mensagem. Eventos pessoais sem profissional
identificado sao tratados como ocupados para ambos, sem expor o titulo ao lead.
Depois diga "pode agendar": nenhuma reserva deve ser criada; agente explica
que a fase atual apenas consulta. Testar idiomas pt/en/es e mensagens seguidas.

Se uma pausa estiver ativa, a consulta para antes do Google. Nao remover
pausas cegamente. Erro de catalogo/Google nao produz horarios inventados.
Agenda/pipeline/pausa pos-agendamento/lembretes nao sao exercitados nessa fase.

## Evidencias

208/208 testes combinados, 193/193 Lote 2, lint focado sem avisos e typecheck
passaram. 15/15 testes Frappe do modulo workflow_tests passaram no HML,
sem POST externo (transportes mockados). Politica efetiva conferida:
test_read_only. OAuth/Google, SQL do preflight de leitura e novo encadeamento
n8n ainda nao foram executados de ponta a ponta. Nao declarar disponibilidade
real homologada apenas porque a UI mostra o badge.
Verificacao visual automatizada nao foi possivel: o navegador da ferramenta
recusou acesso a URL local por politica. Politica efetiva e modulo real do
backend foram conferidos; atualizacao visual deve ser confirmada pelo usuario.
Tunel SSH de loopback foi reaberto no Mac; nao publica o CRM na Internet.

Rollback HML: restaurar site_config privado e workflow_tests.py do backup nas
copias Frappe alteradas; reiniciar somente backend/filas HML apos conferir
jobs. Nao reiniciar n8n, MariaDB/Redis, proxy ou VPS. As copias n8n novas podem
ficar inativas sem afetar Miranda em producao.
