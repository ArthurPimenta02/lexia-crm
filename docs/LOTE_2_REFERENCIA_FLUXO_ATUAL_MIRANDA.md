# Lote 2 - Referência funcional do fluxo atual da Miranda

> Estado em 08/10/2026. Análise somente de leitura de exports locais. Nenhum
> workflow foi importado, executado ou conectado e nenhuma credencial foi
> usada. Este documento não autoriza mudança no n8n, Redis, Supabase ou
> provedores.

## 1. Fontes e convenção

Os exports abaixo foram lidos fora do repositório e **não podem ser
versionados**: todos estão marcados como ativos e contêm valores privados
inline (tokens de provedor, chave de modelo, destinos, telefones da equipe e
contatos). Esses valores devem ser considerados expostos e rotacionados. Nada
deles foi copiado para cá.

| Export | Nós | SHA-256 (prefixo) |
| --- | ---: | --- |
| Omnichannel Miranda (atualizado) | 148 | `550f85150d82` |
| Cérebro Miranda | 30 | `83189836c59a` |
| `criar_agendamento` | 24 | `219bf66cbd18` |
| `verificar_disponibilidade` | 7 | `6b054bf78ae2` |
| Agente de lembretes | 7 | `0e9cc60a13e3` |
| Agente de follow-up | 28 | `3690b2468d86` |

Convenção usada neste documento:

- **[E] evidência do export**: comportamento lido diretamente na topologia,
  nas expressões ou no código dos nós.
- **[H] hipótese sobre produção**: o export sugere o comportamento, mas ele
  depende da versão publicada, de defaults do n8n ou de dados reais que não
  foram verificados.

## 2. Mapa dos workflows e conexões

```text
Z-API/Meta ─► OMNICHANNEL ─► (buffer Redis) ─► Cérebro ─► entrega Z-API/Meta
                  │                              ├─ tools Supabase privado (consultas)
                  │                              ├─ verificar_disponibilidade ─► Google Agenda (leitura)
                  │                              ├─ criar_agendamento ─► Google Agenda + agendamentos_miranda_skin
                  │                              │      ├─ grava pausa_eterna (WhatsApp)
                  │                              │      ├─ encerra lexia_followups (WhatsApp)
                  │                              │      └─ notifica equipe (outro provedor)
                  │                              └─ handoff alta/urgente: status=Desativado 24h + notificação
                  └─ após entregar: upsert em lexia_followups
Agendador 15 min ─► FOLLOW-UP ─► lexia_followups + lexia_mensagens ─► juiz/redator ─► envio
Agendador 1 h   ─► LEMBRETES ─► agendamentos_miranda_skin ─► envio ─► marca lembrete ─► pausa_eterna
```

- [E] O cérebro não tem memória própria: recebe o histórico (últimas 30
  mensagens, com autor) e o contexto pelo payload do omnichannel.
- [E] O cérebro só tem as tools de consulta, `verificar_disponibilidade` e
  `criar_agendamento`. **Não existe tool de cancelamento ou remarcação**; o
  prompt encaminha remarcação para handoff. Logo, `appointment.cancelled` não
  pode hoje vir do cérebro: o cancelamento é manual ou externo.
- [E] Nenhum dos seis exports grava `lexia_handoffs`. O handoff existe só como
  trava Redis `status` e notificação.
- [E] Lembretes, follow-ups, `criar_agendamento` e o cérebro enviam por conta
  própria (provedor do lead ou da equipe), fora do omnichannel.

## 3. Buffer atual

### 3.1 Comportamento [E]

1. Cada mensagem é uma execução própria do n8n.
2. Antes do buffer, cada mensagem passa por eco, filtro, intervenção,
   cancelamento de follow-up e checagem de `pausa_manual` e `status`.
3. Mídia é transcrita/analisada e só então vira texto no buffer.
4. `RPUSH` na lista `<namespace>:buffer:<conversa>` (sem TTL), leitura do
   tamanho, espera de 60 s (`CENTRAL DE CONTROLE.espera`), nova leitura.
5. Tamanho igual: a execução é a última, faz `DEL`, junta os textos com
   `\n\n` e segue. Tamanho diferente: encerra.
6. Só então o lote é gravado em `lexia_mensagens` como **uma** linha
   `recebida`, com `criado_em = $now`.

### 3.2 Mensagem durante o buffer [E]

- A janela é deslizante: a execução anterior desiste e a última processa
  tudo junto, numa única chamada ao cérebro.
- A pausa não é relida depois da espera. Intervenção humana dentro da janela
  não impede a resposta.
- Uma mensagem inserida entre o segundo `GET` e o `DEL` é apagada e nunca
  processada nem persistida.
- Mídia lenta chega ao buffer depois do lote já consumido e vira outro lote.

### 3.3 Mensagem depois que o cérebro foi chamado [E]

- Abre um lote novo e independente. Não há trava por conversa, então duas
  chamadas ao cérebro podem rodar em paralelo.
- A primeira resposta é entregue mesmo sem ter visto a mensagem nova; não há
  versão nem revalidação.
- O segundo lote pode não ver a primeira resposta no histórico, porque cada
  bolha só é gravada depois de enviada (espera de 4 s entre bolhas).
- O contexto Redis é lido e gravado pelas duas execuções; a última vence.

### 3.4 Como preservar o buffer e corrigi-lo

O buffer v2 mantém o que funciona hoje:

- debounce deslizante por conversa, com janela configurável por empresa
  (60 s na Miranda);
- uma única chamada ao cérebro por lote, com as mensagens juntas e na ordem;
- mídia normalizada antes de entrar no lote.

E acrescenta, nesta ordem:

1. **Persistir antes do buffer.** Cada mensagem é gravada individualmente no
   central, com ID e horário do provedor, antes de entrar na lista. O buffer
   guarda só `message_id`; a junção de texto é feita para o cérebro, não para
   o banco. O painel deixa de ver a linha concatenada.
2. **Eleger o dono por sequência, não por tamanho.** Cada entrada recebe um
   número monotônico por conversa. Depois da janela, só a execução cujo número
   ainda é o último disputa o lote. O tamanho da lista deixa de ser o critério
   (ele se repete depois de um `DEL` e de novas entradas).
3. **Consumir de forma atômica.** No lugar de `GET` + `DEL`, uma operação
   atômica retira exatamente os itens elegidos e registra um `batch_id`.
   Itens que chegarem durante a operação continuam na lista para o próximo
   lote. O claim do lote também é gravado no central; se o Redis cair, o lote
   é reconstruído a partir das mensagens persistidas sem lote concluído.
4. **Uma conversa, um lote em processamento.** Lease com fencing por
   conversa. Mensagens que chegam enquanto o cérebro trabalha ficam no buffer
   e formam o lote seguinte, em vez de abrir uma execução paralela.
5. **Mídia pendente.** O dono do lote espera, com limite de tempo, que as
   mídias do lote saiam de `pending`; ao estourar o limite, a mídia entra como
   indisponível, sem inventar texto, e a mensagem original permanece.
6. **Revalidar.** Depois da janela (antes de contexto e cérebro), relê os
   bloqueios e transforma o lote em pendência se houver bloqueio. Antes de
   cada bolha, o gate compara `state_version`/`delivery_epoch`, bloqueios e a
   chegada de mensagem nova do lead depois do corte do lote.
7. **Recuperar.** Um varredor idempotente reprocessa listas órfãs (execução
   que caiu durante a espera) e lotes reivindicados sem resultado.

Decisão aprovada em 08/10/2026: mensagem nova do lead depois do corte do
lote e antes do envio descarta a resposta ainda não enviada e reprocessa com
o contexto atualizado, preservando bolhas já enviadas e efeitos de tools já
executados (regra completa na seção 7.1 da especificação). Hoje o fluxo
entrega a resposta antiga e responde de novo em paralelo.

Modelo local: `lib/omnichannel/inbound-buffer.ts` (itens 2 a 4) e o corte
por sequência em `lib/omnichannel/delivery-plan.ts` (item 6), testados em
`tests/omnichannel-reprocess.test.ts`. A persistência real (item 1), a espera
por mídia (item 5) e o varredor (item 7) dependem do banco e do runtime.

## 4. Lacunas confirmadas e correções

| # | Lacuna [E] | Correção v2 | Situação local |
| --- | --- | --- | --- |
| L1 | Pausa e intervenção não são relidas depois do buffer, do cérebro nem entre bolhas | gate por ação com versão/epoch e bloqueios | testado (`omnichannel-delivery-gate`) |
| L2 | Lotes sobrepostos chamam o cérebro em paralelo | um lote ativo por conversa, com fencing | testado localmente e no HML com mensagens rápidas; resultado antigo descartado e novo claim eleito |
| L3 | Mensagem perdida entre `GET` e `DEL`; falha após `DEL` perde o lote | persistência antes do buffer e consumo atômico | mensagem persistida + RPC de claim passaram no HML; recuperação sob queda real e varredor de órfãos pendentes |
| L4 | Lote gravado como uma linha, sem ID/horário do provedor | uma mensagem por evento com IDs do provedor | candidato v2 persiste individualmente; runtime pendente |
| L5 | Histórico e retomada filtram só `identificador_conversa`, sem `cliente_slug` | histórico pelo escopo completo | testado (`omnichannel-history-isolation`) |
| L6 | Intervenção humana grava a mesma chave `status` do handoff com TTL 900 s e encurta a pausa de 24 h | bloqueios independentes | testado (novo) |
| L7 | Follow-up é rearmado depois de cada resposta, inclusive depois de handoff | gate bloqueia follow-up sob handoff ou agendamento | testado (novo) |
| L8 | Follow-up e lembrete enviam sem checar pausa manual, intervenção ou handoff | automação passa pelo mesmo gate | testado (novo, lembretes) |
| L9 | Envio com `retryOnFail` pode duplicar bolha após timeout | `delivery_unknown` sem retry cego | testado (`omnichannel-delivery-gate`) |
| L10 | Áudio de intervenção que falha no download/transcrição não é gravado | pausa e mensagem antes da mídia | testado (`omnichannel-media-failure`) |
| L11 | Pausa eterna e contatos bloqueados descartam a mensagem sem gravar | registrar sempre, inclusive em pausa | ordem provada no candidato v2; runtime pendente |
| L12 | Retomada fixa em 15 min e apaga a linha `recebida_na_pausa` | expiração por evento; nunca apagar mensagem | modelado; integração pendente |
| L13 | Webhooks sem autenticação e sem assinatura Meta; tenant fixo no fluxo | adaptador autenticado e escopo resolvido no central | candidato usa Header Auth interno e conta central; assinatura nativa pendente |
| L14 | Confirmação de agendamento detectada por texto; a tool não devolve `fim`/timezone estruturados ao mestre | evento `appointment.confirmed` atestado | candidato exige Calendar + linha privada + início/fim/timezone; runtime pendente |
| L15 | Eco Meta por impressão digital de texto (TTL 300 s) | eco por ID do provedor, texto só como fallback | candidato consulta ledger por ID; confirmação com provider real pendente |
| L16 | Resposta preparada é entregue mesmo com mensagem nova do lead | corte por sequência e reprocessamento | testado localmente e no HML: resposta obsoleta suprimida antes de aparecer ou alcançar provider |

Política aprovada em 08/10/2026: a pausa pós-agendamento passa a ser
configuração por empresa no Supabase central, com confirmação única vinculada
à tool quando ligada. Valores iniciais: Miranda ligada, preservando o
comportamento atual [E] (que hoje só existe no WhatsApp); Detail desligada.

Regra fixada em 08/10/2026: **remover manualmente a pausa de um agendamento
confirmado mantém seus lembretes anteriores ao início da consulta**, desde que
o agendamento continue confirmado. Pausa manual, intervenção humana, handoff
e o bloqueio de outro agendamento continuam bloqueando. Cancelamento continua
negando lembretes, e lembrete não sai depois do início do agendamento.
Implementado em `lib/omnichannel/state-machine.ts` e coberto em
`tests/omnichannel-state-machine.test.ts`.

## 5. Hipóteses sobre produção a confirmar

- [H] **Notificação de handoff provavelmente não chega à equipe.** O cérebro
  usa `operacao.uazapi_*` do payload, mas a configuração do omnichannel só
  tem campos Z-API; o próprio `criar_agendamento` registra que a notificação
  "tinha parado" por isso e passou a usar valores inline. A pausa de 24 h do
  handoff continua funcionando.
- [H] **O lembrete pode estar removendo a pausa eterna.** O nó que regrava
  `pausa_eterna` após o lembrete tem `expire` ligado sem `ttl` no export; se o
  default do n8n for 1 segundo, a chave some logo depois e a IA volta a
  responder (talvez de propósito, para tratar a confirmação de presença).
- [H] Depois de um agendamento pelo WhatsApp, o omnichannel pode rearmar o
  follow-up que `criar_agendamento` acabou de encerrar, dependendo da chave de
  conflito do upsert em `lexia_followups`.
- [H] O nó "Esperar 5 Minutos" do follow-up rápido não tem `amount` no
  export; o tempo real depende do default do n8n.
- [H] A mensagem de handoff diz "pausado por 48h", mas a trava gravada tem
  TTL de 24 h.
- [H] Agendamentos feitos pelo Instagram não criam pausa nem encerram
  follow-up, porque esses ramos só existem para WhatsApp.

## 6. O que preservar

- Filtros determinísticos do adaptador Z-API (`fromApi`, grupos, `REVOKE`,
  `@lid`, edições) e origem de anúncio com tema determinístico.
- Ordem "intervenção grava a pausa antes da mídia".
- Registro do eco antes do envio.
- Trava idempotente por `INCR` na retomada e no follow-up rápido.
- Cancelamento de follow-up a cada mensagem nova.
- Payload do cérebro com autor por mensagem e resumo da intervenção.
- Normalização tolerante da saída do cérebro, travas de estilo e a assinatura
  determinística do texto de confirmação gerado pela tool.
- Validações determinísticas da tool de agendamento (grade, horário,
  duplicidade, conflito) e janelas comerciais de follow-up e lembrete.
- Divisão de legenda para Meta e separação do modo teste.

## 7. Exports ainda necessários

### Espelho estruturado para o Frappe CRM

O primeiro destino operacional será um espelho em Frappe, sem mudar o dono da
entrega. O contrato provisório `lexia.crm.event.v1` registra contato, conversa,
mensagem, processamento de mídia, bloqueio, contexto, agendamento, automação,
handoff, atribuição e resultado de entrega. O mapa exato dos seis fluxos está em
`n8n/miranda-crm/miranda-event-map.json`.

Hierarquia fixada:

- evento do provedor é autoridade para mensagem, autoria e atribuição;
- resultado do provedor é autoridade para confirmação de entrega;
- resultado atestado da tool é autoridade para agendamento;
- execução do workflow é autoridade para follow-up, lembrete e contexto;
- resultado validado do cérebro pode solicitar handoff;
- usuário do CRM é autoridade para presença, resolução e retomada manual.

O evento inicial da mensagem ocorre antes de transcrição/análise. O resultado
de mídia chega depois como `message.enrichment.updated`; assim, uma falha não
apaga a mensagem nem o bloqueio humano. IDs internos do CRM incluem ambiente,
empresa, canal, conta e conversa. Resultado incerto de envio permanece em
reconciliação e nunca vira autorização para retry automático.

O sink versionado está inativo e simulado: não possui URL, credencial ou nó de
rede e não foi importado no n8n. O receptor foi validado apenas no laboratório
Frappe sintético, com 27/27 testes. O botão `Testar agente` foi confirmado em
Lead e Deal, mas os destinos e o segredo continuam desabilitados. As seis
cópias sanitizadas preservam a topologia para revisão, mantêm todos os nós
herdados desativados e expõem apenas um ramo de simulação sem serviços. A
ligação real ainda exige importação em n8n isolado, usuário técnico exclusivo,
comparação em modo espelho e aprovação própria.

- Omnichannel e cérebro da Detail, para comparar o tronco comum.
- O workflow que grava `lexia_handoffs`, se existir.
- Error workflow e modo de execução/concorrência do n8n.
- Qualquer fluxo de cancelamento ou remarcação fora do cérebro.

## 8. Candidatos Miranda v2 em 09/10/2026

Os seis exports privados foram relidos sem alteração para construir, em
`n8n/miranda-v2-candidate/`, 16 candidatos inativos. Eles substituem as rotas
problemáticas no desenho local, em vez de apenas adicionar um ramo de teste às
cópias antigas.

O ingresso agora deduplica, grava uma mensagem por evento e só depois aplica
pausa/buffer e espelha o CRM. O ramo humano registra o bloqueio antes de mídia e
termina sem cérebro. O buffer reivindica IDs persistidos por RPC; contexto e
prompt exigem uma única empresa/conversa; cérebro e tools devolvem propostas e
eventos. Follow-up e lembrete continuam workflows separados, mas usam o mesmo
gateway e o mesmo delivery gate. Apenas `08-provider-send-only-v2` conhece as
variáveis de destino dos provedores.

O adaptador Meta foi corrigido para percorrer todos os eventos de todos os
`entry.messaging` do webhook. A regressão executa localmente um lote sintético
com duas mensagens e confirma duas saídas, além da preservação de campanha,
conjunto e anúncio. O adaptador Z-API conserva a mesma atribuição quando o
provedor a oferece.

O caminho reverso do CRM aceita seis comandos fechados: iniciar/encerrar pausa
manual, resolver/retomar handoff, cancelar agendamento e registrar
comparecimento/no-show. Resolver não retoma; presença não mexe em bloqueio;
cancelamento não recria nem encerra pausa. O tenant informado no corpo nunca é
a autoridade: conta e escopo são recarregados no central.

Tudo acima foi verificado por testes locais e varredura de segredo. Ainda não
foi validado pelo runtime do n8n: IDs de Execute Workflow, credenciais,
assinaturas nativas Meta/Z-API, respostas de nodes, tabelas privadas, Calendar,
Frappe e Supabase central precisam de laboratório isolado. Nenhum candidato foi
importado, ativado ou conectado.
