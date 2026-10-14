# Memoria central e primeiro chat real no CRM

## Autorizacao E Fronteiras

Usuario autorizou memoria operacional no central compartilhado, catalogo
Miranda somente em leitura, adaptacao do 02 e instalacao central/Frappe HML.
Repositorio de implementacao: `/Users/arthurpimenta/Developer/lexia-crm`;
checkout antigo Desktop preservado. Branch `codex/lote-2-workflow-mestre-omnichannel`,
HEAD `4bba3d425992af2308c6edce0e1214c40902fe35`, sem commit/push/merge.
Referencia invalida `refs/heads/codex/lote-1-autorizacao-workflows 2` preservada.

Somente central `gaofupndxgitonfmvpzi` e site `crm-hml.localhost` receberam
instalacao. Marcador `isolated_test` conservado: recursos persistentes, sem
bootstrap, limpeza, relabel ou importacao de dados reais. Nenhum workflow
Miranda de producao, banco privado, Google ou provedor foi alterado/executado.
Chamadas REAIS aos modelos e GETs ao catalogo ocorreram com mensagens ficticias.
N8n principal/worker nao reiniciados; somente tres containers Frappe HML.

## O Que Foi Instalado

- SQL review 001-004: ledger calendario, comandos, outbox, filas e projecao;
  instalados como dependencias, nao comprovam Google/comandos funcionando.
- 005: memoria operacional por conversa com RLS, RPCs server-only, CAS,
  escopo completo e cache idempotente de propostas. Invocacao ligada ao UUID
  do lote antes de modelos; nao e uma tabela privada de cerebro disfarcada.
- 006: Miranda virtual, conta fake `24000000-0000-4000-8000-000000000003`,
  politica await_new_message, humana 15min, pausa ate fim de agendamento,
  buffer 6s para ensaio e contexto `miranda-operational-v1` versionado.
- 007: recibo virtual atomico. Registra e marca mensagem em comandos SQL
  sequenciais, dentro do gate/transaction, sem snapshot invisivel entre CTEs.
- 008: origem da mensagem aceita valores antigos e teste/follow-up; valida
  constraint nova antes de substituir a antiga, sem alterar registros.

Backup central em diretorio privado do Mac, pg_dump custom com indice conferido;
backup Frappe site/DB/arquivos no volume privado e fonte/config em arquivo
restrito no host. Restauracao ainda NAO ensaiada. Dependencias validadas em
transacao com rollback antes de aplicar; atualizacoes pequenas posteriores
tambem escopadas ao mesmo alvo. Nenhum segredo entrou nos arquivos de revisao.

## Workflows E Frappe

Copias existentes na pasta CRM MIRANDA SKIN, sem nova familia ou reimportacao:
- 01 `9WFj2lXCHn2N031J`, 259 nodes, publicado apenas para webhook autenticado
  de Agent Test e chamadas internas. Webhooks de canais/comandos e schedules
  desligados; envio real e notificacoes desligados.
- 02 `nNxWWQoxhnQ0XQ8G`, 56 nodes, publicado para chamada do 01. Quatro nodes
  de memoria passaram a Postgres central; seis consultas comerciais privadas
  sao GET/getAll de tabelas fixas. Prompts/especialistas/redator e layout mantidos.
  Nodes Google tools desabilitados; calendar_tools_reviewed=false.
- 03-06 intocados nesta rodada, nao publicados/configurados como parte do ensaio.

Corrigidos no 01: join de eco, colunas/aliases de registro, filtro AND de
tenant/ambiente/status, formato completo do contexto, identificador distinto
para resumo pos-cerebro, leitura somente do resumo mais recente, modo explicito
de expressao SQL e comprovante de persistencia virtual. Acrescentado rastro
sanitizado dos resultados das acoes. Gates/validacao nao foram relaxados.
Todos os nodes e conexoes permaneceram nos mesmos nomes/coordenadas/grafo.

Frappe aponta ao novo webhook no servidor, com autenticacao preservada e
tenant/conta consistentes. workflow_tests.py instalado em backend/workers e
fonte persistente para futuro build. Role Tester apenas no operador sintetico
existente. Conversas sinteticas A/B antigas preservadas, sem relabel; nao se
misturam ao tenant Miranda. Hooks completos de comandos/pipeline/DocTypes ainda
nao instalados: flags correspondentes false. Imagem HML nao foi reconstruida.

## Evidencias

- 295 testes Miranda/bundles: passaram; 193 Lote 2: passaram; 9 Python: passaram.
- Lint dos scripts/modulos/testes alterados, typecheck e diff --check: passaram.
- 41 consultas estaticas preparadas contra o central, sem EXECUTE: passaram.
- 8 assercoes SQL de isolamento, invocacao, captured_state, CAS, campo proibido
  e retry realizadas em transacao com rollback: passaram, sem persistir fixtures.
- Texto PT pelo endpoint REAL do CRM: resposta do 02 exibida na timeline de teste.
- Mesma conversa continuada em ES: memoria v2 e nenhuma reapresentacao de Carol.
- Duas mensagens consecutivas: 2 mensagens do lead, 1 lote, 2 source_message_ids,
  memoria v1 e resposta considerando as duas entradas. Sem bolhas duplicadas.
- Recibos virtuais: `suppressed/virtual_delivered`; provider_send_attempted=false.
  Redis central realmente projetado no corredor; o gate confirmou estado current.

Primeiros ensaios falharam/retiveram respostas pelos defeitos acima; nao foram
contados como aprovados nem apagados. Sucesso foi declarado somente quando
mensagem/resposta/memoria/recibo apareceram no ciclo completo. Testes locais
com doubles nao sao prova de todas as corridas num runtime distribuido.
Sem build Next/Vue: frontend/rotas nao foram alterados nesta rodada.

## Testar Agora

Abra http://crm-hml.localhost:18080/crm/agent-test sem parametro de conversa antiga.
Crie conversa NOVA, selecione WhatsApp virtual e envie mensagem ficticia.
Pode continuar, trocar idioma ou enviar duas mensagens seguidas sem esperar a IA.
"Suprimida" indica ausencia de envio externo, nao que a resposta virtual sumiu.
Nao e necessario alterar credenciais nem reimportar os JSONs portaveis.

## Proximas Etapas

Revisar qualidade/concisoes/guardrails comerciais e clinicos com roteiro maior,
incluindo EN. Homologar pausas/comandos CRM, handoff, timeline/pipeline e 03/04.
Instalar hooks/DocTypes HML antes dessas flags. Depois, disponibilidade no Google
proprio, criacao/cancelamento e, por ultimo, Instagram/WhatsApp de teste.
Leitura completa de midia, efeitos de calendario, notificacoes, comparencia/no-show,
reconciliacao de provedor e migracao de clientes reais NAO validados aqui.
Os arquivos portaveis continuam inativos/com flags fechadas; a configuracao ativa
existe somente nas duas copias autorizadas. Nao ativar producao com este ensaio.
