# Entrega Compartilhada no Omnichannel

## Estado local

`omnichannel-shared-delivery.inactive.json` preserva os 225 nodes do chat
original adaptado, buffer, midia, historico, contexto e chamada do cerebro.
Possui 258 nodes, 80 desligados, e importa inativo. Nao houve acesso a n8n,
SQL, Redis, modelos, provedores ou producao nesta rodada.

O novo `followup-original-crm.inactive.json` usa o pedido generico para esse
receptor. O produtor original de lembretes foi adaptado localmente em
`reminder-original-crm.inactive.json`; leia `LEMBRETES.md`. Ainda precisa de
configuracao/homologacao; nao o ativar esperando que ja esteja conectado.
Asteric permanece fora do escopo.

## Responsabilidades

```text
Atendimento -> persistir -> pausas -> midia/buffer -> contexto -> cerebro
                                                               |
Follow-up -> fila -> pausas -> Juiz -> Redator -> proposta        |
Lembrete -> evento confirmado -> horario -> proposta              |
                                                               v
          entrada privada no MESMO Omnichannel (Execute Workflow)
          -> contrato/origem -> identidade -> conversa -> plano
          -> UMA acao -> estado atual -> gate/claim -> envio
          -> confirmacao + historico -> proxima acao OU interrupcao
          -> recibo correlacionado
```

Nao se cria outro workflow. O atendimento chama a faixa `ENTREGA | ...` no
mesmo export. Automacoes nao passam pelo buffer nem chamam o cerebro de novo.
O router distingue pedido de entrega de evento de entrada. Nao aceita destino,
URL, credencial ou configuracao de envio no pedido.

Cerebro/tools continuam privados; follow-up e lembrete decidem propostas;
Omnichannel controla os efeitos; CRM mostra evidencia, nao intencao da IA.

## Contratos e origem

`shared-delivery-request.schema.json` e `shared-delivery-result.schema.json`
sao provisorios para integracao real, mas aplicados integralmente no codigo
local. Sao validados explicitamente, sem modificar o registro global dos
harnesses anteriores. Exemplos A/B estao em `contracts/omnichannel/v1/examples/`.

- Resposta: `lexia.delivery.plan.request.v1`, request/invocation igual ao ID
  do lote central, escopo completo, captured_state, cutoff e acoes.
- Follow-up/lembrete: `lexia.automation.delivery.request.v1`, com request
  interno `lexia.automation.request.v1`. O alias anterior
  `lexia.followup.delivery.request.v1` permanece aceito.
- Follow-up exige cutoff e source `followup:<fila>:<ultima mensagem ISO>`;
  fila, etapa, tentativas, ultima mensagem, due_at, horario comercial e
  janela legada Meta sao revalidados sob lock da conversa.
- Lembrete nao leva cutoff; source identifica seu agendamento confirmado.
  Uma acao por agendamento, 2h-24h antes, 7h-20h Boston inclusive domingo;
  due_at igual a inicio menos 24h. Ausente/cancelado/fora da janela e negado.
  Reserva/envio confirmado/incerto de outra acao do mesmo evento impede
  novo claim; regras reavaliadas sob lock, inclusive entrega virtual.
- Resposta exige lote `claimed`, mesmo ID/conversa/cutoff. Lote superseded
  nao pode enviar um pedido atrasado.

Escopo, invocation/request e estado de TODAS as acoes precisam corresponder.
Sequencias contiguas 1..N, maximo 20. Reutilizar ID com conteudo, source,
cutoff, snapshot ou plano alterado falha fechado. SQL nos nodes reforca as
verificacoes da RPC anterior; migrations existentes nao foram alteradas.

Banco central, conta e eventos duraveis sao autoridade; Redis e projecao.
Idioma vem do contexto da mesma conversa. Midia usa binding da mesma
conta/conversa/idioma e allowlist de hosts, nunca URL livre da proposta.

## Pausas e entregas

Regras anteriores permanecem: intervencao renovavel, pausa manual, handoff e
agendamento independentes; resolver handoff nao retoma IA; cancelamento
impede lembretes, mas nao encerra/recria a pausa; retomada padrao por nova
mensagem e opcao answer_pending continuam sob a maquina de estado.

Pausa de agendamento permite somente lembrete do proprio evento confirmado.
Outro agendamento ou bloqueio humano/manual/handoff ainda impede esse envio.
Nenhum texto confirma agendamento. A confirmacao terminal excepcional de tool
nao foi habilitada implicitamente por este novo transporte.

Antes de CADA envio: estado/epoch, cutoff, projecao, source e bloqueios sao
reavaliados. O claim central serializa com comandos e aplica ordem/fencing.
Somente out_acquired=true autoriza a chamada. Intervencao antes do claim
bloqueia; depois do claim o envio ja esta em andamento e nao pode ser desfeito.
Nao ha espera de digitacao depois do claim.

Texto, imagem+caption e audio sao unidades ordenadas explicitas. Caption
Z-API pertence a mesma acao da imagem. PDF/video continuam preservados na
ENTRADA original, mas nao sao tipos de SAIDA habilitados pelo contrato atual.
Novas automacoes exigem schema, autoridade, politica/RPC e testes; tipo
desconhecido nunca vira HTTP arbitrario.

## Erros e recuperacao

| Situacao | Conduta |
| --- | --- |
| Contrato/config/identidade/origem invalidos | Falha antes do provedor |
| Contexto/fila/projecao indisponivel | Nao enviar nem afirmar sucesso |
| Pausa/estado/cutoff mudou | Interromper restante; manter anteriores |
| Outra execucao ganhou claim | Nao chamar provedor de novo |
| Ledger sent com ID | Retornar duplicate confirmado, sem repetir |
| Ledger claimed/delivery_unknown | Exigir reconciliacao |
| Timeout, HTTP ambiguo, excecao ou retorno sem ID | delivery_unknown, sem retry automatico |
| Provedor aceitou, mas commit falhou | Incerto; ledger pode continuar claimed |
| Commit sent, mas recibo se perdeu | Mesmo pedido consulta ledger, sem repetir |
| Segunda acao falhou/ficou incerta | Primeira confirmada; terceira nao inicia |
| CRM falhou apos envio | Reprocessar espelho, nao entrega ao lead |

Nenhum node de rede/DB/subworkflow desta faixa faz retry automatico.
Unstarted successors aparecem como previous_action_not_confirmed.
Excecao/4xx/5xx nao comprovam ausencia de aceitacao. O receptor nao cria retry
de failed/unknown por conta propria. Reconciliacao exige prova/autoridade;
worker de claims abandonados, replay CRM e retry autorizado seguem pendentes.

Registro da mensagem confirmada e finalizacao da acao compartilham transacao
SQL. Sem livro duravel confirmado, follow-up nao incrementa etapa/tentativas
nem promove pipeline. O espelho/outbox Frappe ainda precisa de integracao.

## Configurar e testar gradualmente

1. Importar os dois JSONs como NOVAS copias inativas; nao substituir Miranda.
2. Selecionar Postgres Central Lote 2 TESTE. Marcador disposable/isolated_test
   e project_ref devem conferir ANTES de escrita. Nunca credencial de producao.
3. Conferir Config Cliente Lexia e Config Entrega Compartilhada: mesmo
   ambiente/empresa/conta sinteticos. Este ultimo e Set generico confiavel,
   modo virtual, provider_reviewed=false, sem herdar configuracao do payload.
4. Selecionar cerebro/modelos/Redis isolados conforme README anterior. Um
   flag de revisao nao neutraliza tools do cerebro de producao.
5. No follow-up: delivery_workflow_ref aponta a esta copia de Omnichannel;
   revisar contrato e marcar delivery_contract_reviewed. shared_delivery
   chama o receptor, que continua VIRTUAL e nao conta envio real. Schedule
   permanece desligado. O modo preview do follow-up nao chama o receptor.
6. Conferir schema legado lexia_followups/playbook_vendas_miranda, constraints
   de origem teste_workflow/followup_agente e fixtures aprovadas. Baseline
   Lote 2 sozinho nao garante essas tabelas/constraints. Nenhum SQL aplicado.
7. Ensaiar chat, pedidos repetidos, pausas e intervencao entre acoes; conferir
   livro, historico e recibos. Agent Test atual recebe texto de resposta; UI
   para disparar fila/lembrete nao foi criada nesta rodada.
8. Configurar produtor ORIGINAL de lembretes adaptado, fixtures centrais e
   mirror de confirmacao/cancelamento da tool isolada. Ver LEMBRETES.md.
9. Somente depois de homologar, configurar provedor de teste.

VIRTUAL aceita apenas fake/test:. Mensagem system/teste_workflow idempotente
por action_id e checkpoint suppressed/virtual_delivered. Nao grava sent
falso, nao incrementa follow-up e nao muda Kanban. Escrita virtual atomica
tambem aplica bloqueios independentes e a ordem das acoes.

PROVIDER exige provider_reviewed e conta central delivery_owner=v2,
delivery_mode=deliver. Nesta entrega o adaptador preparado e WhatsApp/Z-API
de teste: texto/imagem/audio via HTTP Request nativo (original nao tinha node
nativo Z-API). URL base precisa corresponder ao provider_account_ref central;
Client-Token em credencial exclusiva. Nao versionar/distribuir exports com
URL tokens preenchidos. Media bindings e hosts ficam vazios por padrao.
Meta continua bloqueado ate adaptar/revisar permissoes, janela, versao da API
e captions. Antigos sends foram conservados, mas desligados/desconectados.

## Verificacao e pendencias

Rodada inicial: 33 regressoes novas de entrega. Rodada de lembretes: mais 30,
128 testes especificos combinados e 193 locais Lote 2 passaram.
ESLint focado e typecheck passaram. Testes executam o codigo dos
nodes com adaptadores injetados, sem rede, DB ou modelos. Primeiras rodadas
detectaram uma referencia nao suportada e um snapshot afetado pelo registro
global: corrigidos sem relaxar validacao ou regenerar workflows alheios.

SQL foi analisado somente como configuracao de nodes; sintaxe/transacoes no
banco NAO foram executadas/homologadas. Item linking, loops e autochamada na
versao n8n instalada, credentials e respostas de provedor ainda exigem ensaio.
Nao houve mudanca Next/Frappe, portanto build da plataforma nao foi executado.
Pipeline Em follow-up/recuperado/convertido, agenda/presenca, outbox e recovery
continuam fases separadas. Esta entrega nao e certificacao de producao.

Fontes: scripts/build-miranda-shared-delivery.mjs,
scripts/lib/miranda-shared-delivery.mjs,
scripts/lib/miranda-shared-delivery-sql.mjs,
tests/miranda-shared-delivery.test.mjs, Agent.MD, PLAN.MD, especificacao Lote 2
e FOLLOWUP.md.
