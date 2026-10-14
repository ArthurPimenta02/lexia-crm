# Miranda: base de producao para a migracao Lexia/Frappe

## Fechamento Local Dos Mesmos Seis Arquivos

Consumidores de comandos, projecao, outbox e notificacoes preparados e ligados
localmente ao Omnichannel; fila central usa o agendamento original; confirmacao
terminal usa somente recibo atestado. Frappe: dispatcher/hook de pipeline nativo
e confirmed_at preparados na fonte, nao instalados. Primeira consulta Google
seleciona automaticamente o orquestrador readonly, sem tool de criacao exposta.
Os fatos atuais de agendamento/cancelamento vao no payload do cerebro para nao
confiar somente em memoria antiga. No SDK Postgres, numeros grandes configurados
como numbers e validados por limites seguros; callbacks reais ainda nao ensaiados.
254 regressoes Miranda, 193 base e 9 Frappe offline; lint/typecheck locais.
Leia n8n/miranda-migration-review/CONFIGURACAO.md e RESULTADOS.json.
Nao chamar estes arquivos de producao homologada: servicos/SQL nao executados.
Pendencias de codigo anteriores aos canais continuam explicitas no MANIFEST,
incluindo answer_pending, recovery de claimed, Meta e atribuicao duravel de Ads.
O restante deste documento conserva o inventario/decisoes da revisao inicial.

## Escopo e estado

Referencia fornecida pelo usuario em 12/10/2026:
`/Users/arthurpimenta/Downloads/MIRANDA WORKFLOWS ATUALIZADOS.zip`.
SHA-256 do ZIP: `0b086e49a28da2671b156336c3a1416d8faf0095629f50c03ac2812a3173a04f`.

Somente leitura/extracao local de seis JSONs; entradas __MACOSX ignoradas.
Nenhum workflow foi chamado/importado/publicado nem qualquer servico alterado.
Os exports brutos contem configuracao inline sensivel. Nao copiar para Git,
pacote de revisao, docs ou fixtures. Nomes/topologia/hashes sao referencias,
nao autorizacao para usar credenciais, calendarios ou numeros de producao.

Branch preservada: `codex/lote-2-workflow-mestre-omnichannel`.
HEAD preservado: `4bba3d425992af2308c6edce0e1214c40902fe35`.
Alteracoes locais anteriores e referencia Git invalida permanecem intactas.

## Referencias conferidas

| Workflow | Nodes | SHA-256 |
| --- | ---: | --- |
| MIRANDA SKIN EXPERT - OMNICHANNEL | 148 | 550f85150d82d328b1f1e52059ef19d28cf33342cdddf5b7f9ed9c900fab7779 |
| Cerebro - MIRANDA SKIN EXPERT | 30 | b9054494af0c21cf733f5b5190e9467ea2e5a0acf91716c94e4325f464fb413f |
| AGENTE DE FOLLOW-UP - MIRANDA | 28 | 3690b2468d8625ed10e7ab6fa549bcb1ff61bb8692923bf6e8dec07f92f5202e |
| AGENTE DE LEMBRETES - MIRANDA | 7 | 0e9cc60a13e30b47607b23c8783c7a00f9d615b01cddede096d6ba2b61551fda |
| verificar_disponibilidade | 7 | 6b054bf78ae20c0f787e51c2003520b2e6dc74bd70d4e64c879776c21b926fdf |
| criar_agendamento | 24 | 219bf66cbd188d7cc7bed08cc11db98ea91388c8a69ef5f673d4ad19f3e84063 |

Todos os arquivos declaram active=true. Isso registra o export; o n8n nao foi
consultado nesta rodada. Comparacao estruturada com os seis arquivos recebidos
em 09/10: cinco workflows sem mudanca de parameters; o cerebro altera apenas
Preparar Handoff e Notificar Samuel (uazapi). Nenhum node foi adicionado/removido.
Os prompts comerciais do cerebro nao mudaram nessa comparacao.

## Decisoes confirmadas pelo usuario

1. Novo Supabase e Redis centrais compartilhados por empresas, com isolamento
   completo. Recursos persistentes da futura estrutura, nao descartaveis.
2. Decisao posterior de 12/10: memoria OPERACIONAL do atendimento no central
   compartilhado por escopo. Catalogo/playbook Miranda privados somente em
   leitura pelo cerebro; tools permanecem separadas. Nenhuma migracao de
   pacientes/memoria antiga. Relatorio atual: MIRANDA_MEMORIA_CENTRAL_CRM_20261012.md.
3. Intervencao humana: 15 minutos, renovavel, sem encurtar por evento atrasado.
4. Retomada padrao: aguardar nova mensagem; answer_pending permanece opcional
   por politica explicita, nao comportamento automatico da Miranda.
5. Miranda pausa depois de agendar ate ends_at; cancelamento conserva esse
   prazo, nega lembretes e nunca recria pausa ja encerrada.
6. Lembrete do proprio agendamento confirmado pode passar pela pausa dele;
   intervencao humana, pausa manual e handoff bloqueante ainda impedem envio.
7. Handoff normal: notificar/registrar solicitacao, sem bloquear o atendimento.
   Alta/urgente: bloquear ate resolucao E retomada manual separada, sem TTL.
8. Cancelar pelo Frappe deve cancelar tambem no Google. Um pedido nao e uma
   confirmacao: enquanto nao houver resultado Google verificavel, conservar
   cancelamento solicitado/pendente de reconciliacao; nao declarar cancelado.
   Negar lembretes durante cancelamento solicitado, sem apagar outros motivos.
9. Notificacoes WhatsApp continuam fazendo parte do produto. Configuracao e
   destinatarios devem estar separados do modelo e respeitar modo de operacao.
10. Seis workflows compreensiveis, baseados nos originais; sem proliferar
    copias de teste ou substituir inteligencia por respostas simuladas.

O rotulo atual isolated_test/disposable dos marcadores e os helpers antigos
NAO foram alterados. A decisao de uso persistente revoga qualquer presuncao de
limpeza/recriacao desses recursos. Graduacao de ambiente, protecao de destinos,
schema, retencao e backfill exigem procedimento revisado, sem apagar dados.

## Diferencas que precisam ser corrigidas

- Handoff original prepara texto "48h", mas Pausar Conversa usa TTL 86400
  (24h). A nova regra aprovada substitui ambos por resolucao/retomada manual
  apenas para alta/urgente. Normal nao deve chamar RPC que crie bloqueio.
- O cerebro atualizado usa Client-Token/phone/message (Z-API), apesar do nome
  antigo mencionar uazapi. Criar agendamento ainda usa token/number/text.
  Usuario confirmou UAZAPI para Samuel/socio no agendamento e Z-API para
  handoff. Preservar protocolos separados; nao copiar o segredo inline.
- O original permite notificacao da equipe em modo teste. A nova estrutura
  deve exigir habilitacao explicita e destino autorizado; teste virtual nao
  deve atingir equipe/numero de producao por default.
- Pausa eterna de agendamento e a retomada por Wait de 15 minutos nao atendem
  as novas regras confirmadas. Remover efeitos antigos, nao deixar dois donos.
- Os originais nao tem tool/ramo especifico de cancelamento Google. Ele deve
  ser incorporado a Agendamentos, sem permitir que o modelo escolha um event_id
  arbitrario; resolver referencia opaca pelo escopo e ledger duravel.
- Entrega, eco, historico e notificacoes nao podem ser confirmados apenas por
  uma resposta HTTP ambigua; progresso confirmado precisa sobreviver a erro.

## Trabalho por workflow

| Workflow | Preservar | Adaptar |
| --- | --- | --- |
| Omnichannel | Adaptadores, filtros, audio/imagem/PDF/video, buffer, contexto, historico e baloes | Registro antes de pausa/midia; autoria por ID; configuracao de contexto central por empresa; memoria reconstruivel; unico dono de entrega; comandos CRM; outbox/eventos; atribuicao estruturada |
| Cerebro | Especialistas, orquestradores, redator, playbook, catalogo, precos e regras clinicas | Continuidade/idioma; propostas separadas de efeitos; eventos atestados das tools; notificar/pausar como pedidos ao Omnichannel, com prioridade preservada |
| Follow-up | Juiz, redator, etapas, dia combinado, limites e audio | Fila escopada; estado antes dos modelos; enviar pelo Omnichannel; contar so entrega confirmada; ciclo/recuperacao/conversao; estrutura de midia para fotos futuras |
| Lembretes | Intervalo 1h, janela 2h-24h, 7h-20h Boston, pt/en/es | Fonte de agendamento confirmado; cancelamento solicitado/confirmado impede; envio comum; nao renovar pausa; auditoria por evento |
| Disponibilidade | Catalogo, variantes, duracoes, profissionais e calculo de slots | Calendario/configuracao confiaveis; ocupado/invalido/falha distintos; escopo e snapshot; sem confirmar criacao |
| Agendamentos | Validar pedido, duplicidade, conflito, criacao e confirmacao | ID idempotente; ledger e resultado incerto; notificacoes via dono comum; evento confirmado; cancelamento autenticado vindo do CRM |

## Fronteiras comuns, sem multiplicar workflows

O controle atomico compartilhado pertence ao Supabase central; Redis projeta
estado/cache/buffer, nao e o unico lugar das pausas. O Frappe usa DocTypes,
permissoes, timeline e pipeline nativos, com extensao Lexia reutilizavel.
Manter poucos pontos visiveis de integracao, com nomes orientados a tarefa.
Nao esconder negocio num Code monolitico nem representar funcoes ausentes
como integracao concluida. Schemas/RPCs/outbox e o consumidor de comandos CRM
sao dependencias reais do pacote; JSON sozinho nao aplica essas dependencias.

Direcao do pipeline: Novo -> Em atendimento -> Agendado; resultado de
comparecimento por agendamento, nao por inferencia de chat. Ciclo de follow-up
guarda programado/enviado/recuperado/convertido independentemente da etapa,
com IDs/tempo e prova de entrega/resposta/confirmacao. Campanha/adset/ad/UTM
so por dados disponiveis e confiaveis; atribuir desconhecido quando ausentes.
Custos/reporting das APIs de anuncios e dashboard detalhado ficam posteriores.

## Aceitacao antes de entregar a nova base

- Conferir proveniencia de prompts e codigo de negocio contra este ZIP.
- Auditar cada caminho de canal, midia, pausa, tool e notificacao.
- Provar registro de entrada durante pausa e pausa antes de processamento caro.
- Testar prompts/historicos/contas de duas empresas sem mistura por first/item.
- Testar duplicacao, intervencao atrasada, versao obsoleta, concorrencia,
  entrega parcial e resposta incerta sem retry automatico.
- Testar handoff normal sem bloqueio e alta/urgente com resolucao/retomada.
- Testar cancelamento Google, inclusive resultado incerto e pausa ja encerrada.
- Conferir nodes nativos, credenciais por nome, configuracao sem segredos,
  defaults sem saida externa e conexoes completas entre os seis workflows.
- Validar canvas por regioes, sem sobreposicao de nodes e com rotas legiveis;
  distinguir verificacao estatica de inspecao no editor real do n8n.
- Documentar dependencia preparada versus instalada; nao afirmar homologacao
  de Frappe/Supabase/Redis/Google/n8n sem executar o respectivo ensaio autorizado.

Estado atualizado: primeiros seis candidatos inativos em
`n8n/miranda-migration-review`, gerados do ZIP atualizado com os geradores
locais de base original e ajustes adicionais de prioridade/outbox/cancelamento.
Nao sao apenas os JSONs brutos nem um mestre final homologado. Os controles
isolated_test permanecem como limite de chamadas, nao permissao de descarte;
nenhum marcador remoto foi alterado. A verificacao de identidade deixa de
exigir disposable=true nos candidatos, sem retirar projeto/tenant/escopo.

SQL preparado, nao aplicado, em `supabase/review/miranda-migration`:
ledger de agenda persistente, wrapper de handoff, mapeamento opaco de Google,
cancelamento solicitado/claimed/unknown/confirmado, gate de lembretes e outbox
CRM. O schema privado de memoria preparado inicialmente e legado e NAO deve
ser instalado no central; a decisao posterior usa a memoria operacional 005.
SQL 001-008 e corredor de texto 01/02 agora instalados no central/HML conforme
MIRANDA_MEMORIA_CENTRAL_CRM_20261012.md; o restante desta secao e historico.
Helper de pipeline preparado em `integrations/frappe/migration_pipeline.py`.
Fonte Frappe local ajustada em integration.py e no DocType Lexia Handoff;
nenhum container/site/imagem foi atualizado.

Transporte de notificacoes, consumidor CRM/projecao/outbox/recovery, espelho
completo de automacoes/tools, criacao da fila, pipeline e adaptador Meta ainda
exigem trabalho. Credenciais/flags nao resolvem esses itens sozinhas. Nao
ativar candidatos nem declarar homologacao de modelos, Google ou canais.
O README do pacote discrimina implementado, simulado e pendente.
