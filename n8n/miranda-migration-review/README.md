# Miranda / Lexia: seis arquivos para configuracao e ensaio

## Estado Atual Do Corredor 01/02

Memoria operacional central autorizada e instalada em 12/10/2026. As copias
ja importadas 01/02 foram adaptadas pelo plugin e publicadas para texto virtual
no Agent Test HML. Catalogo Miranda no 02 somente GET; quatro nodes de memoria
agora usam Postgres central. Nomes e coordenadas preservados. Nao reimportar
estes templates sobre as copias configuradas: arquivos portaveis continuam
inativos, sem IDs/segredos e com flags/identidades para preenchimento.

Texto PT, continuidade ES e buffer de duas mensagens foram exercitados no CRM.
Google/provedores/notificacoes/schedules/comandos/pipeline seguem desligados;
03-06 nao foram alterados ou publicados. Relatorio/evidencias e roteiro em
`../../docs/MIRANDA_MEMORIA_CENTRAL_CRM_20261012.md`.
As afirmacoes abaixo de "nao instalado/executado" sao o HISTORICO do pacote
inicial, nao a situacao atual das duas copias publicadas.

**Implementacao local candidata, ainda nao homologada nem instalada.**
Leia `CONFIGURACAO.md` para a ordem exata do primeiro teste. Os nomes dos seis
arquivos foram mantidos; nao importar outra familia de variantes antigas.
Foram ligados consumidores de comandos/projecao/outbox, fila central,
notificacoes e confirmacao terminal. Nenhum desses recursos foi executado em
servicos reais nesta rodada; selecionar credenciais sozinho ainda nao basta.
Derivados dos seis exports atualizados de producao recebidos em 12/10/2026.
Nenhuma instancia n8n, Supabase, Redis, Google, Frappe ou modelo foi acessada
nesta rodada. Nao houve SQL aplicado, importacao, publicacao, restart ou deploy.

## Os seis arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| 01-omnichannel.inactive.json | Entradas, registro individual, autoria, pausas, midia, buffer, contexto/historico, chamada do cerebro, entrega comum e outbox CRM |
| 02-cerebro.inactive.json | Especialistas, catalogo, playbook, atendimento, agendamento e redator originais; continuidade/idioma e propostas, sem enviar ao provedor |
| 03-followup.inactive.json | Juiz/redator/etapas originais, consulta de pausas, proposta ao mesmo dono de entrega e conferencia de comprovante |
| 04-lembretes.inactive.json | Janela original 2h-24h, 7h-20h Boston inclusive domingo, pt/en/es; envio pelo Omnichannel, sem renovar pausa |
| 05-disponibilidade.inactive.json | Resolver servico/profissional/duracao e calcular slots com logica original, consultando Google via node nativo |
| 06-agendamentos.inactive.json | Validacao/duplicidade/conflito/criacao originais, ledger e ramo novo de cancelamento de evento mapeado |

O Omnichannel nao substitui midia/buffer por respostas fixas. Os modelos reais
estao representados por nodes originais; credenciais e flags precisam de revisao.
O modo virtual refere-se apenas ao destino da mensagem de teste no CRM.
Preview de follow-up/lembrete nao comprova envio. Os testes locais usam doubles.

Nodes Supabase, Postgres, Redis e Google sao nativos. HTTP fica para provedores,
download de midia e API Frappe, que nao possuem substituto nativo equivalente.
Scripts Code nao fazem HTTP escondido. Nao houve importacao ou inspecao do
canvas no editor n8n real. A verificacao visual desta rodada usa desenhos locais
das coordenadas/conexoes, nao screenshots de uma instancia n8n.

## Organizacao Visual

Layout corrigido nos mesmos seis arquivos, sem mudar logica, parametros,
conexoes, credenciais, flags ou quantidade de nodes executaveis. Todos os
138 nodes originais ainda presentes voltaram EXATAMENTE as coordenadas dos
exports de producao: 54/26/28/7/7/16, respectivamente. Nodes antigos removidos
em rodadas anteriores nao foram recriados para decorar o canvas.

O percurso original fica horizontal; os controles acrescentados ficam em
faixas horizontais acima/abaixo, identificadas por funcao. O caminho longo de
cada faixa segue da esquerda para a direita, com saidas laterais para decisoes.
Nao existe mais quebra automatica a cada 12 nodes nem linhas em serpentina.
No Omnichannel, as notas originais das secoes mantidas recuperam geometria e
cores, somente com titulos sanitizados. Nos demais, secoes nomeadas delimitam
entrada, inteligencia, tools, entrega e retorno.

Loops e conectores de tools continuam conectados como antes; preservar essas
conexoes e as coordenadas originais nao elimina todos os cruzamentos possiveis
do roteador de fios do n8n. Nao foram adicionados nodes de passagem so para
desenhar linhas. Nenhum node executavel nem caixa de secao se sobrepoe a outro.

Referencia segura: `tests/fixtures/miranda-layout/production-geometry.json`
contem somente nomes, tipos, posicoes e notas sanitizadas; nenhum parametro
operacional dos exports brutos. `node scripts/layout-miranda-migration-review.mjs`
reaplica apenas o layout e atualiza hashes, sem gerar SQL nem chamar servicos.
O gerador completo tambem usa esse layout para evitar regressao futura.

## O que mudou localmente

- Registro de cada mensagem antes de pausas/processamento de midia.
- Prazo humano via RPC duravel; erro de audio preserva mensagem e intervencao.
- Pausas independentes no central, sem depender das antigas tres chaves Redis.
- Contexto por empresa, origem vinculada a chamada/mensagens e historico escopado.
- Respostas, follow-ups e lembretes convergem para entrega comum por acao.
- Progresso confirmado preservado; timeout/excecao exige reconciliacao.
- Handoff normal/baixo nao bloqueia; alta/urgente exige resolucao e retomada.
- Outbox CRM antes do HTTP; 200 sozinho nao confirma sincronizacao.
- Cancelamento solicitado bloqueia lembrete antes de comprovacao Google;
  unknown nao libera novo DELETE, e pausa removida/expirada nao e recriada.
- Reducer de follow-up calcula recuperacao/conversao por fatos confirmados,
  nao por uma sugestao de etapa do modelo; inclui escopo e eventos atrasados.

## Dependencias preparadas, nao instaladas

1. Baseline Lote 2 e migrations aditivas existentes, depois de inventario do
   schema instalado. Nao reaplicar bootstrap/fixtures/cleanup do laboratorio.
2. `supabase/review/miranda-migration/202610120001_calendar_tools_persistent.sql`.
3. `supabase/review/miranda-migration/202610120002_migration_control.sql`.
4. `supabase/review/miranda-migration/private-brain-memory.sql`, somente no
   projeto PRIVADO escolhido para a memoria, nunca no central nem no banco
   Miranda ativo sem revisao/aprovacao propria.
5. Fonte Frappe local: `lexia_crm/integration.py` e DocType `Lexia Handoff`.
   Block opcional para notificacao normal; handler preserva outros bloqueios.
6. `202610120003_runtime_consumers.sql`: comandos, projecao por versao,
   outbox com claim, identidade original da mensagem, fila/ciclo e confirmacao.
7. `202610120004_team_notifications.sql`: fila/claim de notificacoes da equipe.
8. `integrations/frappe/migration_pipeline.py` e `migration_commands.py`:
   helpers e dispatcher preparados; hook local na ingestao transacional,
   commands.py enfileira depois do commit, workflow_tests.py declara escrita.
   DocType Lexia Appointment adiciona confirmed_at; fonte/metadados devem ser
   instalados juntos. Pipeline depende do mapeamento de Status nativos por site.

Os recursos novos sao persistentes/compartilhados. O rotulo atual isolated_test
continua nos contratos enquanto a migracao nao e graduada explicitamente.
Ele NAO autoriza apagar dados nem obriga recriar os projetos. Os candidatos
aceitam identidade nao descartavel, mas continuam exigindo projeto/escopo.

## Antes Do Ensaio Real

- Revisar/aplicar dependencias do central/privado e instalar os modulos Frappe.
  Nada foi instalado; primeiro inventariar baseline e nao executar cleanup.
- Conferir IDs importados, credenciais, politicas/prompt, ator e contas. Os
  Sets vazios sao intencionais, nao credenciais ja conectadas.
- Homologar callbacks dos nodes nativos, SQL, Redis, Google, modelos e CRM.
  Projecao/outbox/equipe estao ligados em arquivos, nao comprovados no runtime.
- Manter await_new_message: answer_pending automatico e recovery de lote
  claimed interrompido ainda exigem implementacao antes de habilitar a opcao.
- Filtros operacionais de contatos, ramo rapido e atribuicao duravel de Ads
  continuam pendentes. Nao afirmar que a fila normal cobre todas essas variantes.
- Pipeline foi ligado localmente ao handler de eventos, mas esta desligado,
  sem instalacao/mapeamento nativo; nao e kanban ja atualizado na VPS.
- Assinatura/conta e janela de resposta Meta. O adaptador de entrega comum ainda
  aceita apenas Z-API/WhatsApp; Meta deve permanecer desligado ate revisao.
- Graduar contratos/flags para operacao staging/production, sem alterar os
  originais ativos. As restricoes test:/fake dos corredores antigos ainda
  impedem usar estes candidatos como migracao final de canais reais.

O primeiro corredor e inteligencia/continuidade e disponibilidade pelo CRM.
Criacao usa calendario secundario proprio e permissao adicional de escrita;
resultado virtual nunca significa que Google tambem foi simulado. Entrada real
de canais/schedules/notificacoes continua desligada. Upload/renderizacao de
audio/imagem/video no Agent Test nao foi criado nesta rodada.

## Configuracao quando as lacunas forem fechadas

Importar somente copias inativas em pasta propria. Config Cliente Lexia e os
Sets de cada workflow concentram escopo/conta/projeto e aliases, sem senhas.
Vincular IDs IMPORTADOS: Omnichannel -> Cerebro; Cerebro -> Disponibilidade e
Agendamentos; Follow-up/Lembretes -> Omnichannel. Nunca usar IDs de producao.
O Google usa `Config Tools Lexia.calendar_id`, com ID exato/allowlist, e OAuth
`Lexia Google Agenda Migracao`; cancelamento tem seu Set confiavel separado.
Criacao/cancelamento iniciam desligados. Primeiro homologar disponibilidade.

Prompt de contexto precisa de uma unica configuracao ativa no central para
environment/cliente_slug; ausencia/duplicidade falha fechado. Modelos e catalogo
privado precisam de credenciais revisadas. Config Entrega Compartilhada deve
coincidir com o escopo escolhido; nenhuma conta de outra empresa e fallback.

## Evidencias

Veja `RESULTADOS.json` para os comandos/resultados desta rodada. Testes locais
de sintaxe/contratos/regras/doubles nao homologam SQL, callbacks dos nodes,
Google/OAuth, qualidade conversacional, notificacoes ou concorrencia distribuida.
Nao reusar os resultados antigos como prova do novo pacote integrado.

Gerador: `scripts/build-miranda-migration-review.mjs`. Ele le exports locais,
gera somente arquivos e nunca importa, executa ou publica workflows.
