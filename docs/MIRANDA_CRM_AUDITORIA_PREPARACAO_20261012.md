# Auditoria e preparo: primeiro ensaio 01 + 02 no CRM

> Historico da auditoria INICIAL. A autorizacao posterior de memoria central e
> instalacao foi executada; estado atual, testes e pendencias em
> `MIRANDA_MEMORIA_CENTRAL_CRM_20261012.md`. As frases "nao instalado" abaixo
> descrevem o inventario anterior, nao o estado atual do corredor 01/02.

## Limites e evidencias

Inspecao do plugin n8n e metadados do central/Frappe HML em 12/10/2026.
Nenhuma conversa, contato, senha/token ou export bruto foi copiado.
Supabase lido em transacoes READ ONLY com TLS verify-full; MariaDB HML em
transacao READ ONLY com rollback. Nenhuma migration/fixture foi aplicada.
Nao houve chamada de modelo, Google, provedor, execucao/publicacao de workflow,
reinicio de container, alteracao de producao, commit ou push.

O preparo nao significa que o corredor ja esta funcionando. Nenhum ensaio
ponta a ponta dos dois novos workflows foi realizado.
Inventarios sanitizados em `docs/audits/miranda-crm-20261012/`; podem ser
reproduzidos pelo auditor do central e pelo auditor Python no backend HML.
Os scripts abortam fora do alvo esperado e nao consultam mensagens/clientes.

## Supabase central conferido

Projeto `gaofupndxgitonfmvpzi`, marcador `isolated_test`, 22 tabelas Lexia e
43 funcoes Lexia. Baseline Lote 2 ja existe; NAO reaplicar bootstrap/cleanup.
As funcoes calendar/migration novas e tabelas de ledger de tool, outbox CRM,
fila de follow-up e notificacoes ainda nao existem.
As colunas novas de enriquecimento de mensagem e handoff `blocking` tambem
nao existem. Migration de 09/10 sobre comparecimento/cancelamento central
ja deixou suas funcoes presentes; conferir signatures antes de instalar.

Somente contas/configuracoes sinteticas A/B foram encontradas no recorte:
nao existe conta fake, politica nem prompt ativo de `miranda_skin_experts`.
A usa retomada `await_new_message`, 15 minutos humana e pausa pos-agendamento;
B usa `answer_pending`. Nao reutilizar B nem mudar sua politica.

Dependencias locais: revisar 001 calendar_tools_persistent, 002 migration_control,
003 runtime_consumers, 004 team_notifications em
`supabase/review/miranda-migration`, depois cadastrar o novo tenant/conta fake,
politica aprovada, binding do cerebro e prompt/schema de contexto da Miranda.
Nenhum desses passos foi aplicado nesta rodada. O UUID reservado no JSON
preparado e apenas proposta, NAO uma conta que ja existe no banco.

Encontrado e corrigido um defeito de geracao do SQL 001: o replacement string
JavaScript interpretava `$'` das regex SQL como sufixo do arquivo e o duplicava.
O helper usa callback para inserir texto literalmente. Arquivo agora tem uma
unica transacao/tabela e quatro funcoes. Tres regressoes locais comprovam essa
correcao; isto nao substitui compilacao/ensaio em PostgreSQL antes da aplicacao.
Nenhum dos seis JSONs foi regenerado por essa correcao.

## Frappe HML conferido

Site `crm-hml.localhost`, imagem Lexia 0.6.8. Conversations e Agent Test existem.
Agent Test esta em `remote/full_agent_virtual`, empresa `empresa_sintetica_a`,
conta `24000000-0000-4000-8000-000000000001`, calendario `test_read_only`.
O alvo omnichannel aponta para `lexia-miranda-crm-agent-test-readonly-v3`,
NAO para a copia nova. O segredo de teste existe; seu valor nao foi lido no relatorio.

Fontes novas locais nao estao todas instaladas: `migration_commands.py` e
`migration_pipeline.py` ausentes no container; integration.py/commands.py nao
possuem os hooks preparados. Handoff ainda exige `block`; Appointment nao
tem `confirmed_at`. Para texto virtual, priorizar compatibilidade de
workflow_tests.py/workflow_test_chat.py e identidade/alvo. Comandos/pipeline
devem continuar desligados; sua homologacao nao e requisito para o primeiro oi.

`integrations/frappe/miranda-agent-test.prepared.json` e um PATCH DE CONFIGURACAO
preparado, nao aplicado: merge dos campos, e merge apenas de
`lexia_workflow_test_targets.omnichannel`, preservando outros alvos e segredos.
Nao sobrescrever site_config inteiro. `lexia_allow_workflow_tests=false` e
intencional ate os gates estarem fechados. Antes de instalar, backup restrito
do site/config e revisar diff entre fonte instalada e local; nao reiniciar n8n.

Conectividade somente leitura comprovada: GET `/api/method/ping` a partir do
container n8n retornou HTTP 200/pong no frontend HML da rede Docker compartilhada,
usando `Host: crm-hml.localhost`. URL interna de transporte pode usar
`http://lexia-frappe-hml-frontend-1:8080`, COM esse Host explicito. Sem ele, o
Frappe seleciona um site errado e pode devolver 404. Nenhum alias/network ou
node HTTP foi alterado nesta auditoria; preparar esse header quando o espelho
operacional for configurado. Isso nao comprova autenticacao ou ingestao de evento.

## n8n conferido e alteracao limitada

Pasta `CRM MIRANDA SKIN`, seis copias novas, todas inativas:
- 01 Omnichannel: `9WFj2lXCHn2N031J`, 259 nodes.
- 02 Cerebro: `nNxWWQoxhnQ0XQ8G`, 56 nodes.

Banco/Redis central HML e modelos ja selecionados no 01. Os Sets de identidade
e revisao ainda nao foram preenchidos. No 02, os dez nodes Supabase apontam
para o central, inclusive catalogo e memoria, mas essas tabelas privadas nao
existem nele. Flags `models_reviewed/private_data_reviewed` continuam false.
Credencial selecionada por nome/ID nao prova conexao nativa validada no runtime.

Somente DOIS ajustes aplicados ao rascunho do 01 pelo plugin:
1. Webhook `LEXIA | Webhook Teste Frappe` usa `Lexia CRM Agent Test Header Auth`,
   em vez da credencial de chamadas ao Frappe.
2. `Config Cliente Lexia.brain_workflow_ref` aponta para a copia importada 02.

Leitura posterior confirmou: nenhuma mudanca adicional em codigo, conexoes,
posicoes, flags ou settings; 01 continua inativo, sem versao publicada.
02 e workflows 03-06 nao foram alterados. JSONs locais portaveis continuam
sem IDs de credencial/destinos sensiveis; nao reimportar para substituir ajustes.
Avisos preexistentes do plugin: cinco nodes HTTP ainda sem credencial atribuida
e excesso de elementos visuais; nao foram ocultados nem usados para refazer
o layout contra a instrucao do usuario.

## Decisao de memoria aberta

Usuario perguntou se a memoria pode ficar no central, separada por empresa.
Sim para memoria do atendimento: historico, resumo versionado, idioma, fatos,
perguntas respondidas e estado confirmado. Esses conceitos ja pertencem ao
central operacional. Catalogo, playbook, prompts privados e respostas brutas
de tools nao devem ser copiados automaticamente para esse armazenamento.

Recomendacao: centralizar a memoria OPERACIONAL, com escopo completo e controle
de versao, evitando mais um banco apenas para o chat. Memoria adicional 02 hoje
usa contrato/identidade de privado e gravacoes nativas; para centraliza-la,
revisar o payload permitido e o caminho autenticado de leitura/escrita.
NAO criar `lexia_brain_memories` no central nem marcar um central como privado
apenas para passar nos guards. Nao ajustar flags para fingir que o catalogo existe.
Esta mudanca de fronteira depende de confirmacao; ainda nao foi implementada.

## Checks locais desta rodada

288 regressoes de workflows/bundles passaram, incluindo tres novas de SQL.
Lint focado, typecheck e diff whitespace passaram. SQL 001 ainda nao foi
compilado/executado no PostgreSQL; inspecao estatica e geracao nao provam isso.
Os seis JSONs portaveis conservam todos os hashes do manifesto anterior.
Diretorio de entrega antigo em Downloads nao foi encontrado nesta auditoria;
nao foi recriado automaticamente. Para SQL, usar a fonte corrigida no repo,
nao uma copia antiga do SQL 001 entregue anteriormente.

## Proximo passo

Confirmar armazenamento de memoria operacional no central e origem do catalogo
(copia segura ou leitura restrita das tabelas comerciais, nunca memoria ativa).
Depois revisar/aprovar instalacao aditiva no central/HML, backup e verificacao,
cadastro do contexto correto, configuracao restante dos mesmos 01/02, publicacao
somente do corredor virtual e um ensaio ficticio. Agenda/canais/equipe continuam
desligados. Nenhuma senha nova do usuario foi necessaria para esta auditoria.
