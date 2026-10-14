# Miranda: omnichannel baseado no original

## Tools Originais: Calendario Pessoal (12/10/2026)

`availability-original-crm.inactive.json` e
`create-appointment-original-crm.inactive.json` preservam os 7/24 nomes
originais, com 26/55 nodes apos guards/ledger. Supabase so consulta catalogo;
Postgres somente HML; Google usa calendario secundario pessoal revisado.
Sem notificacoes, pausas eternas ou writes no privado Miranda. Cerebro
recebe metadata de estado/confirmacao confiavel; JSON compativel atualizado.
SQL novo preparado em arquivo, NAO aplicado. Flags CRM/Omnichannel ainda
desabilitados; importacao sozinha nao libera agendamento pelo CRM.
Guia de configuracao, limites e riscos: [`TOOLS_AGENDA.md`](TOOLS_AGENDA.md).

## Cerebro Original Local (12/10/2026)

`brain-original-crm.inactive.json`: cerebro baseado nos 30 nodes originais,
com especialistas/prompts/regras preservados e memoria/continuidade isoladas.
51 nodes totais; sem envio/pausa direta. Importacao manual, inativa; NAO
substitui producao nem completa sozinho a integracao CRM/agenda. Credenciais,
tabelas privadas novas e tools provisorias exigem configuracao/revisao.
32/32 regressoes novas, 163/163 combinadas, 193/193 Lote 2, lint e typecheck
passaram; modelos/calendario/banco/n8n nao foram executados nesta rodada.
Leia [`CEREBRO.md`](CEREBRO.md) antes de conectar ao Omnichannel.

## Entrega Comum Local (11/10/2026)

Nova copia: `omnichannel-shared-delivery.inactive.json`. Preserva a base
original e passa respostas/pedidos de follow-up/lembrete pela mesma faixa
de envio. Padrao virtual; integra a solicitacao privada, nao certifica
producao. Configuracao, limites e testes:
[`ENTREGA_COMPARTILHADA.md`](ENTREGA_COMPARTILHADA.md).
O follow-up correspondente usa `followup-original-crm.inactive.json`.
Credenciais, SQL, loops e autochamada ainda precisam de ensaio isolado;
Meta continua pendente. O produtor original de lembretes agora tem a copia
`reminder-original-crm.inactive.json`: regras, configuracao e gates de teste
em [`LEMBRETES.md`](LEMBRETES.md). Nenhum servico foi acessado.

Artefato local: `omnichannel-original-crm.inactive.json`.
Gerador: `scripts/build-miranda-original-crm.mjs`.
Regressoes: `tests/miranda-original-crm.test.mjs`.

## Correcao Para Agent Test (11/10/2026)

Nova copia: `omnichannel-crm-agent-test.inactive.json`. Gerador:
`scripts/build-miranda-crm-agent-test.mjs`; regressoes adicionais:
`tests/miranda-original-agent-test.test.mjs`.
Parte do JSON reexportado pelo usuario, conservando os 220 nodes existentes
e acrescentando cinco nodes de validacao/preflight. Nao substitui o arquivo
anterior nem altera workflows remotos. Continua baseada no tronco original,
nao em uma resposta de IA simulada. O cerebro e uma dependencia selecionavel.

Correcoes desta copia:

- Entrada estrita `lexia.workflow.test.request.v1`, como enviada pelo Frappe.
  A conversa vem de `scope.conversation_ref`, nao de um session_id avulso.
  Mensagens seguintes conservam a sessao; run_id/message_id continuam unicos.
- Conferencia de tenant, conta, canal, ambiente e controles antes de qualquer
  escrita. Postgres e API Supabase precisam confirmar a mesma identidade
  `lexia_environment_identity` descartavel antes de persistir eventos.
- Todos os Postgres passam a exigir `LEXIA - Postgres Central Lote 2 TESTE`.
  A referencia `POSTGRES MIRANDA SKIN EXPERT` foi retirada desta copia. Nomes
  nao comprovam o destino: o preflight tambem valida o marcador do projeto.
  Credenciais sao apenas referencias por nome, sem IDs ou valores secretos;
  precisam ser selecionadas/conferidas depois da importacao.
- Payload do Execute Workflow do cerebro restaurado. Historico e contexto
  versionado permanecem; pedido explicito de idioma tem prioridade sobre o
  idioma anterior. Mensagens ambiguas preservam o idioma conhecido.
- Saida `lexia.workflow.test.result.v1`, bolhas textuais ordenadas e tratamento
  sanitizado de excecao da execucao filha. Falha nao vira sucesso simulado.
- Filtro de idioma antes do registro virtual, seguido da revalidacao de
  versao/epoch/lead_seq/bloqueios. Idioma usa a heuristica local existente;
  nao e prova infalivel para textos ambiguos nem substitui teste do modelo.
- Chat virtual responde ao CRM pelo webhook; nao chama o espelho operacional.
  Webhooks de provedores ficam desabilitados e envio real fica desconectado.
  A entrada interna tambem recusa eventos que nao sejam do contrato de teste.

### Configuracao No n8n

1. Importe como uma nova copia. Nao altere ou publique o omnichannel Miranda
   de producao. Esta copia importa inativa.
2. Selecione Postgres do central descartavel, Supabase do mesmo projeto,
   Redis exclusivo de teste e modelo do agente de contexto. OpenAI/Gemini dos
   ramos de midia ficam preservados, mas o chat atual recebe somente texto.
3. Em `Config Cliente Lexia`, confira `environment=isolated_test`,
   `cliente_slug`, `test_account_ref` e `test_project_ref`. Defaults sao os
   identificadores nao secretos do laboratorio previamente autorizado:
   tenant `empresa_sintetica_a`, conta
   `24000000-0000-4000-8000-000000000001`, projeto `gaofupndxgitonfmvpzi`.
   Nao houve reconferencia remota nesta rodada. A conta precisa corresponder
   ao canal escolhido no CRM; comece pelo canal cadastrado no manifesto,
   WhatsApp virtual. Politica, RPCs/tabelas e prompt/schema ativo precisam
   existir no central isolado. Falta de configuracao bloqueia, sem fallback.
4. Selecione uma copia isolada do cerebro em `Chamar Cerebro do Cliente`.
   Remova/desligue tools, calendario, notificacoes e envios reais dessa copia.
   Sua memoria tambem precisa ficar no ambiente de teste, com chave pelo
   escopo completo; telefone vazio do chat virtual nao e chave de memoria.
   Nao selecionar memoria/Supabase privado da Miranda em producao.
   So depois da revisao marque `cerebro_teste_revisado=true`. Esta flag comeca
   falsa de proposito; flags no payload nao neutralizam uma tool antiga.
   `permitir_tools_teste`, `permitir_envio_real` e
   `permitir_notificacao_handoff` continuam false.
5. No webhook `LEXIA | Webhook Teste Frappe`, selecione Header Auth exclusivo:
   nome do header `Authorization`; valor `Bearer <token-exclusivo-do-teste>`.
   Precisa ser o mesmo token server-side do Frappe, nao uma credencial Meta
   nem o token do receptor de eventos CRM. Nao colocar valores no JSON.
6. Publique somente a nova copia para habilitar sua URL de producao:
   `/webhook/lexia-miranda-crm-agent-test-original-v2`.
   Nao usar `/webhook-test/` como destino permanente do CRM.

### Configuracao No Servidor Frappe

Conferir, sem expor segredos no navegador:

- `lexia_allow_workflow_tests=true`, `lexia_environment=isolated_test`;
- `lexia_client_ref` e `lexia_workflow_test_account_ref` iguais ao Set;
- `lexia_workflow_test_mode=remote`;
- `lexia_workflow_test_execution_mode=full_agent_virtual`;
- `lexia_workflow_test_calendar_access=disabled`;
- `lexia_workflow_test_targets.omnichannel` com a URL do novo webhook;
- host dessa URL em `lexia_workflow_test_allowed_hosts`;
- `lexia_workflow_test_bearer_token` igual ao Header Auth do webhook.

Nenhuma dessas configuracoes server-side foi alterada nesta entrega. O
Frappe grava/projeta o resultado na area Agent Test existente, fora da inbox
operacional. `frappe_url` nao e necessario para esse retorno virtual.
O transporte atual do Frappe possui timeout de 120 segundos: janela de buffer
e tempo de modelo precisam caber nesse limite. Timeout nao prova ausencia de
escrita; nao reenviar automaticamente com outro run_id. Retry idempotente nao
reexecuta o cerebro, mas a recuperacao automatica de uma resposta perdida nao
esta implementada nesta copia.

### Verificacao E Proxima Etapa

38 testes especificos passaram: 20 novos de Agent Test, 14 do omnichannel
original adaptado e 4 de layout. Os testes novos executam Code/expressoes Set
localmente com fixtures; tres envelopes tambem passaram pelos validadores
puros extraidos do codigo Frappe local, sem importar seu runtime ou iniciar
servicos. A suite local Lote 2 passou com 193 testes e ESLint do novo gerador
e seus testes passou. Isto nao comprova uma execucao fim a fim no n8n instalado.

Pendentes: selecao de credenciais/cerebro, configuracao server-side e teste
real da copia isolada. Midia, tools/calendario, follow-ups, lembretes e
pipeline automatico nao foram conectados nesta rodada. Nenhum SQL foi
executado, nenhum servico/modelo/provedor foi chamado e nada foi publicado.

```sh
node scripts/build-miranda-crm-agent-test.mjs '<reexport-local-do-omnichannel-crm.json>' n8n/miranda-original-crm/omnichannel-crm-agent-test.inactive.json
node --test tests/miranda-original-agent-test.test.mjs tests/miranda-original-crm.test.mjs tests/miranda-original-layout.test.mjs
```

As secoes abaixo registram a alternativa anterior e seus limites. Nao
habilitar seus canais reais para testar o chat desta nova copia.

## Organizacao Visual (11/10/2026)

Canvas organizado por `scripts/lib/miranda-original-layout.mjs`: etapas
numeradas, tronco da esquerda para a direita, cinco faixas de midia, contexto
e cerebro separados, teste virtual e espelho CRM em faixas proprias. Notas
originais reposicionadas; nodes legados desativados ficam em area de referencia
inferior. Quatro notas de secao foram acrescentadas, sem nodes executaveis.

Esta revisao altera somente posicoes e notas. Comparacao com o JSON entregue
anteriormente confirmou codigos, parametros, IDs, credenciais, flags e conexoes
identicos. 18 testes (14 funcionais + 4 de layout) e ESLint passaram. Previa
geometrica local conferida; o desenho efetivo das curvas no editor n8n ainda
depende da importacao. Ramos de erro, retornos de loops e espelho comum podem
manter conexoes longas; nao foram inseridos nodes de roteamento para altera-las.

Copia para importacao: `~/Downloads/MIRANDA-OMNICHANNEL-LEXIA-CRM-ORGANIZADO.json`.
O arquivo entregue anteriormente foi preservado. Nenhum workflow remoto foi
editado, importado ou executado nesta revisao visual.

Esta alternativa parte do export original de 148 nodes fornecido pelo usuario,
nao do mestre compacto ou do corredor simulado. Os nomes originais ficam no
canvas; ramos substituidos ficam desabilitados na faixa inferior. A importacao
cria uma copia inativa com novos caminhos de webhook. Nao substitui o original.

## Alteracoes

- Ingestao e autoria individual duraveis antes de buffer, pausas e midia.
- Bloqueio humano transacional antes de transcricao; falhas preservam mensagem.
- Ramos originais de texto, audio, imagem, PDF e video, com tratamento de erro.
- Buffer duravel com eleicao de lote e fencing; Redis como cache auxiliar.
- Historico isolado por conversa/tenant e contexto versionado com proveniencia.
- Prompt/schema selecionados exclusivamente da configuracao central do tenant.
- Payload antigo do cerebro preservado, com historico e instrucoes adicionais.
- Fatos operacionais allowlisted persistidos; proposta de agendamento nao vira
  confirmacao por regex ou texto livre. Handoff cria bloqueio independente.
- Gate central e leitura legada antes de cada bolha; ID estavel por acao.
- Resultado incerto interrompe entregas e exige reconciliacao, sem retry cego.
- Teste virtual autenticado e isolado, historico de respostas marcado como
  teste, revalidacao de estado e ausencia de chamada ao provedor.
- Eventos versionados para o receptor Frappe existente de mensagens, bloqueios
  e resultados de entrega. O receptor e responsavel por Lead/Deal/timeline.
- Referral Meta segue para o cerebro e gera atribuicao no CRM com IDs de
  anuncio/campanha/conjunto somente quando fornecidos. Nao busca Ads API.

## Configuracao Necessaria

Selecionar credenciais nativas de Postgres, Supabase central, Redis, OpenAI e
Gemini; selecionar cerebro apos importar. Credenciais HTTP nomeadas para envio
Z-API, Meta, Frappe e autenticacao de ingresso/teste. Nenhum segredo inline.

Preencher environment, tenant, UUID de cada conta, URLs de Z-API e Frappe em
`Config Cliente Lexia`. As contas, politicas, RPCs/tabelas do Lote 2 e
configuracao ativa de prompt/schema precisam existir no ambiente escolhido.
Nenhum SQL foi aplicado por este gerador. Variaveis `$env` nao sao utilizadas.

Para teste, selecionar uma copia do cerebro com tools isoladas e entao marcar
`cerebro_teste_revisado`. Flags enviadas ao cerebro antigo nao sao uma fronteira
de seguranca: o workflow privado precisa ser revisado. Uma copia apontando ao
Google Agenda real pode produzir efeitos mesmo sem enviar ao WhatsApp.

Envio real inicia desligado; exige tambem conta central ativa, owner v2 e modo
deliver. O ingresso Meta usa Header Auth: requer adaptador autenticador que
valide a assinatura do provedor. Verificacao GET, efeitos de edicao/exclusao e
reacao nao estao integrados nesta copia.

## Limites e Verificacao

Verificacao local: sintaxe dos Code nodes e expressoes, estrutura/referencias,
ausencia de segredos inline e 14 regressoes com dados sinteticos. A suite local
Lote 2 passou com 193 testes; ESLint do gerador e testes passou. Nao houve importacao,
execucao no n8n, chamada de modelo/provedor, acesso remoto, SQL ou publicacao.
Teste local nao comprova compatibilidade runtime de todos os parametros das
versoes n8n instaladas, credenciais, respostas binarias ou contratos privados.

Esta entrega e apenas o omnichannel. Os outros cinco workflows ainda precisam
de adaptacao propria para eventos atestados de tools/agendamento, cancelamento,
lembretes, follow-ups, presenca/no-show e envio compartilhado. A leitura de
travas legadas conserva bloqueios, mas nao torna efeitos desses workflows
automaticamente transacionais ou seguros no teste.

Retomada answer_pending, recuperacao de lotes orfaos, reconciliacao de entrega,
outbox/replay automatico para CRM e assinatura Meta precisam de consumidores
integrados. Sem eles, nao apresentar esta copia como pronta para producao.
O replay de atribuicao depende de conservar o evento de origem: o schema
atual de ingress nao guarda seu payload; a outbox de atribuicao e pendente.

## Reproducao Local

```sh
node scripts/build-miranda-original-crm.mjs '<export-original-local.json>' n8n/miranda-original-crm/omnichannel-original-crm.inactive.json
node --test tests/miranda-original-crm.test.mjs
node --test tests/miranda-original-layout.test.mjs
```

O export original nao e versionado nem incluido em pacotes.
# Follow-up Original Adaptado (11/10/2026)

`followup-original-crm.inactive.json` parte do follow-up original de 28 nodes,
mantendo Juiz, Redator, playbook, etapas e nomes. Acrescenta preflight, escopo,
pausas, comprovacao de entrega e eventos `automation.updated`/`message.recorded`.
Importa inativo, com schedule e espelho CRM desligados; default `preview`.
O delivery comum para automacoes ainda nao esta integrado ao omnichannel de
teste anterior. Nao ativar envio por simplesmente preencher seu ID.
Configuracao, contratos provisorios e limites em [FOLLOWUP.md](./FOLLOWUP.md).

