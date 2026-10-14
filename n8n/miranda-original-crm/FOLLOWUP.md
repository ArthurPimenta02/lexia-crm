# Miranda Follow-up Original / Lexia CRM

## Entrega local

O artefato `followup-original-crm.inactive.json` e uma adaptacao do export
original de 28 nodes, nao uma troca pelo agente compacto/simulado. Todos os
28 nomes permanecem; ha 65 nodes contando protecoes e cinco notas. Juiz,
Redator, seus modelos configurados no original e o playbook continuam no
mesmo workflow. Nenhum workflow de producao foi acessado ou alterado.

O JSON e **inativo**, sem IDs de credencial, tokens inline, destinos reais,
numeros da equipe, dados de leads ou midias privadas. `pinData` esta vazio.
Schedule, envio HTTP de eventos e espelho de mensagens ficam desligados.
O modo inicial e `preview`; modelos exigem revisao/configuracao manual.

Nao e um pacote pronto para ligar em producao. O receptor local agora existe
em `omnichannel-shared-delivery.inactive.json`; veja
`ENTREGA_COMPARTILHADA.md`. O export de chat anterior continua sem esse
transporte. Nenhuma integracao remota foi realizada. Os novos nodes nao
substituem o buffer, contexto ou midia do
omnichannel; seguem separados do atendimento e das tools privadas.

## O que foi preservado

| Original | Adaptacao |
| --- | --- |
| Fila `lexia_followups`, leitura Supabase | Node nativo mantido, com tenant vindo de configuracao confiavel |
| Uma analise por lead | Loop com lote 1, escopo validado e item pareado; evita `.first()` como origem do lead |
| Horario 7h-20h, segunda-sabado, Boston | Regra original mantida, tambem revalidada depois dos modelos |
| Janela Meta com margem de 23h30 | Mantida como regra legada, nao como atestado atual de permissao do provedor |
| Maximo de duas etapas/tentativas | Preservado; pular etapa 2 encerra, nao cria etapas 3/4 |
| Dia combinado e caso "eu te aviso" | Mantidos para decisoes validas; nao vencem pausa/permissao |
| Historico, autoria humana e follow-ups anteriores | Consulta pelo escopo central; mensagens da IA precisam de entrega confirmada |
| Juiz e playbook | Prompts comerciais originais; JSON invalido agora interrompe, em vez de forcar envio |
| Redator curto e anti-repeticao | Mantidos, com idioma do lead; texto vazio/repeticao sem alternativa falham fechado |
| Audio contextual por tema/idioma | Configuracao vazia, sem copiar arquivos privados; conversa prevalece sobre anuncio antigo |
| Envio e eco no follow-up | Substituidos por pedido ao dono compartilhado da entrega; follow-up nao tem credenciais de canal |
| Aviso WhatsApp para Samuel | Ramo visual preservado, mas produz pendencia; nao afirma que notificou a equipe |
| Registro e contador apos HTTP | Exigem recibo correlacionado e acao `sent` no livro duravel, com ID do provedor |

`Registrar Eco Follow-up` agora conserva a proposta, sem escrever uma chave
de texto antes do envio. O delivery deve identificar ecos pelo ID do provedor.
O contrato de audio usa `media_ref`: o delivery precisa resolver essa referencia
sem herdar URL/token de outro cliente. Imagens/legendas ja existem no contrato
geral de acoes e no receptor compartilhado, mas nao foram habilitadas no
redator deste follow-up.

## Caminho pelo canvas

1. `Teste Manual` -> `Config Follow-up` -> identidade Postgres + Supabase.
2. `Buscar Follow-ups Vencidos` -> loop -> resolver conversa -> verificar pausas.
3. `Travas de Follow-up`: regras comerciais; enviar, reagendar ou pedir contato manual.
4. Historico -> playbook -> analise -> Juiz -> validacao -> Redator.
5. Preparar texto/audio -> pedido estruturado -> revalidar estado, fila e horario.
6. Previa sem envio, ou pedido privado ao Omnichannel de entrega comum local,
   ainda pendente de homologacao n8n/banco.
7. Recibo + livro de acoes -> registrar mensagem confirmada -> atualizar fila.
8. Preparar mensagem/evento CRM, espelho desabilitado -> proximo lead.

Pausa humana, manual, handoff ou agendamento interrompe antes dos modelos.
Nenhum node remove bloqueios ou agenda. Cancelamento de agendamento continua
impedindo lembretes e preservando a pausa aprovada; este workflow nao altera
essa regra. O estado duravel central e a autoridade; nao e preciso consultar
uma chave Redis isolada para decidir que a conversa esta pausada.

Se uma acao ja existir, o ramo `Ja processado - nao reenviar` encerra aquele
item sem recriar texto/acao. Inclusive `claimed`, `delivery_unknown` e
`failed` exigem revisao/recuperacao, nao uma nova tentativa automatica.
Se o subworkflow devolver erro apos possivel aceitacao, vira incerto. Somente
uma acao ja confirmada no banco pode comprovar que houve envio apesar do erro.
Registro/contador sao condicionais; CAS de etapa/status/ultima mensagem evita
incrementar duas vezes ou reativar uma fila que o atendimento ja cancelou.

## Configuracao para revisar no n8n

Importar como workflow novo, sem substituir o original. Nao ativar schedule.

No Set `Config Follow-up`:

- `environment`: manter `isolated_test`; production e rejeitado nesta copia.
- `cliente_slug`: tenant sintetico cadastrado no banco de teste.
- `account_ref`: UUID da conta correspondente, nunca numero de telefone.
- `test_project_ref`: identificador do Supabase descartavel; os dois acessos
  precisam conferir `lexia_environment_identity` com esse mesmo identificador.
- `delivery_mode`: manter `preview`. Nao incrementa tentativas nem altera fila.
- `models_reviewed`: somente `true` depois de selecionar credencial de modelo
  de teste. O workflow tem chamadas reais de modelo quando configurado; nao
  foram executadas por este trabalho.
- `audios_followup`: opcional `{ "laser": { "pt": "audio:laser:pt" } }`;
  use referencias aprovadas por idioma, nao URLs privadas nos exports.
- `require_contact_check`: manter `true`. Conta `fake` dispensa consulta real;
  WhatsApp/Z-API precisa de verificacao confiavel de contato salvo. Esse
  adaptador ainda nao esta conectado. Falha/ausencia bloqueia, nunca libera.

Credenciais por nome, a selecionar na interface:

- `LEXIA - Supabase Central Lote 2 TESTE`: identidade, fila e playbook.
- `LEXIA - Postgres Central Lote 2 TESTE`: escopo, historico e RPCs existentes.
- `LEXIA - Modelo Follow-up TESTE`: os dois modelos originais.
- `LEXIA - API Frappe TESTE`: somente quando revisar o espelho; API server-side,
  nunca anon/service role ou senha no body.

**Schema legado pendente:** o baseline Lote 2 nao cria `lexia_followups` nem
`playbook_vendas_miranda`. Nao usar credencial de producao para suprir isso.
Conferir/restaurar schema sanitizado e dados sinteticos em etapa autorizada
separadamente. As colunas usadas sao as do export original; RPCs e campos
`omni_*` sao os ja existentes no SQL versionado. Nenhum SQL foi aplicado aqui.

A fila legada identifica por tenant/canal/identificador. O resolver exige
exatamente uma conversa central correspondente e a conta configurada; caso
haja ambiguidade entre contas, bloqueia. Nao inventa telefone para Meta nem
escolhe a primeira linha. A evolucao para referencias de escopo na propria
fila sera uma revisao de banco separada.

## Contrato de delivery: PROVISORIO

O node nativo `Enviar Follow-up` usa `Execute Workflow`, nao webhook de canal.
O receptor local e `omnichannel-shared-delivery.inactive.json`. Somente depois
de revisar e homologar essa copia no ambiente isolado pode-se configurar
`delivery_workflow_ref`, `delivery_contract_reviewed = true` e mudar de preview.
Nao apontar para o omnichannel anterior: sua entrada atual e so chat de teste.

Entrada de transporte:

```json
{
  "schema_version": "lexia.automation.delivery.request.v1",
  "request": { "schema_version": "lexia.automation.request.v1" },
  "lead_cutoff_seq": 1
}
```

`request` acima esta abreviado: na execucao contem todos os campos exigidos
pelo schema existente `automation-request.schema.json`, inclusive escopo,
source_ref, due_at e acoes fechadas. Cada acao tem IDs estaveis, versao/epoch
capturados, ordem e conteudo. A tentativa deriva de tupla JSON com escopo,
fila, etapa e ultima mensagem do lead; reagendar o horario nao cria outro ID.
O transporte e validado por `shared-delivery-request.schema.json`; o alias
legado `lexia.followup.delivery.request.v1` continua aceito pelo receptor.

Retorno de transporte (tambem provisorio):

```json
{
  "request_id": "11111111-1111-4111-8111-111111111111",
  "scope": {},
  "captured_state": { "state_version": 12, "delivery_epoch": 7 },
  "results": []
}
```

Aqui `scope` esta abreviado: exige os cinco componentes exatos do pedido.
`results` exige exatamente um resultado no schema `delivery-result` para a
acao unica atual. O receptor deve validar transporte/contrato, registrar
automacao, reutilizar os mesmos IDs, persistir proposta, conferir permissao,
horarios e lead_cutoff_seq e reivindicar pelo gate transacional **imediatamente
antes de cada acao**. So o receptor pode ter credencial de envio. Ele deve
gravar conclusao/ID no livro de acoes; `sent` sem essa prova vira incerto.
Fila e mensagem nao sao atualizadas por uma resposta textual do modelo.

Reconciliacao autentica, replay de eventos e recovery apos interrupcao entre
envio, historico e atualizacao da fila ainda precisam de runtime/worker.
Nao recriar uma acao para contornar um erro. Um resultado incerto nao e uma
falha segura para retry. As permissoes n8n/SQL reais continuam a conferir.

## Eventos e pipeline

Este JSON prepara `lexia.crm.event.v1` validado pelo schema existente:

- `automation.updated`: scheduled, pending, sent, suppressed, cancelled,
  failed ou delivery_unknown. Previa e pending, nunca sent.
- `message.recorded`: somente apos envio comprovado e registro duravel,
  com action_id, message_id, autoria e ID de provedor; text/audio corretos.

Cada evento tem escopo completo, IDs estaveis e correlacao/source_ref do ciclo.
Nodes HTTP sao necessarios apenas para API Frappe, nao para Postgres/Supabase.
O espelho da mensagem vem antes do evento de automacao. Estao desligados:
preencher endpoint **de homologacao** exato e credencial nao foi feito aqui.
Nao ha outbox duravel de CRM/replay automatico novo nesta copia; preservar o
JSON de evento original para replay, sem trocar attempted_at/reason sob o mesmo
ID. Se o espelho falhar apos envio, corrigir o espelho, nunca reenviar ao lead.

Regras propostas para a proxima etapa, ainda **nao aplicadas** no Frappe:

| Sinal confiavel | Efeito futuro |
| --- | --- |
| `automation.updated: sent` comprovado | Entrar em "Em follow-up" |
| Nova mensagem do lead apos esse envio, no mesmo escopo/ciclo | "Follow-up recuperado", retomada de conversa ativa |
| `appointment.confirmed` atestado pela tool, ligado ao ciclo recuperado | "Follow-up convertido" e etapa Agendado |
| Preview, pausa, pending, failed, delivery_unknown | Nao contar como envio/recuperacao/conversao |

O consumidor Frappe atual atualiza o registro/status de automacao, **nao a
coluna Kanban automaticamente**. Nao foi alterado neste trabalho. Recuperacao
precisa ser emitida/relacionada pelo omnichannel; conversao pela tool de
agendamento, nunca pelo Juiz/Redator. Guardar esses indicadores como historico
de atribuicao sem apagar quando o lead muda de etapa. A janela de atribuicao
e prioridade frente a agendamentos/ciclos concorrentes ainda exigem decisao.
Comparecimento/no-show segue como fato informado pelo usuario do CRM.

## Verificacao local

Gerar a partir do arquivo original, que continua fora do repositorio:

```sh
node scripts/build-miranda-original-followup.mjs '<original.json>' n8n/miranda-original-crm/followup-original-crm.inactive.json
node --test tests/miranda-original-followup.test.mjs tests/miranda-original-agent-test.test.mjs tests/miranda-original-crm.test.mjs tests/miranda-original-layout.test.mjs
npm run test:lote2:local
npx --no-install eslint scripts/build-miranda-original-followup.mjs scripts/lib/miranda-original-followup-runtime.mjs tests/miranda-original-followup.test.mjs
```

Resultado da rodada de entrega compartilhada: 27 testes de follow-up,
98 testes especificos combinados (incluindo 33 novos de entrega) e
193 testes locais Lote 2 passaram; lint e typecheck passaram. Testes executam os Code nodes
com entradas/referencias sinteticas; queries sao conferidas estaticamente.
Luxon/DateTime usa relogio substituto nos testes; n8n real, item linking,
parametros dos nodes, fuso/DST em Luxon, SQL em banco, modelo, midia e entrega
continuam nao verificados. Nao foi necessario build da plataforma: nenhum
codigo Next.js/Frappe foi modificado. Nenhum servico foi iniciado ou acessado.
