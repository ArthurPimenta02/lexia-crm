# Lote 2 - Workflow Mestre Omnichannel

> Atualizacao autorizada em 12/10/2026: memoria OPERACIONAL do atendimento no
> Supabase central compartilhado, isolada por ambiente/empresa/canal/conta/conversa.
> Catalogo/playbook Miranda permanecem privados e sao consultados somente em
> leitura pelo cerebro. O trecho datado de 08/10 abaixo e historico da
> especificacao, nao uma afirmacao de que nenhum SQL foi aplicado desde entao.
> O primeiro corredor real de texto 01/02 no Frappe HML esta habilitado; Google,
> canais e demais efeitos seguem desligados. Detalhes e limites atuais em
> `MIRANDA_MEMORIA_CENTRAL_CRM_20261012.md`. Esta decisao nao autoriza migrar
> pacientes ou dados antigos nem alterar a Miranda em producao.

> Estado em 10/10/2026: especificação, implementação local, candidatos
> funcionais inativos, runtimes sintéticos e seis workflows completos HML, na branch
> `codex/lote-2-workflow-mestre-omnichannel`, criada a partir do commit
> `4bba3d425992af2308c6edce0e1214c40902fe35`. Contratos, funções puras,
> fixtures, testes e exports inativos foram criados. O schema, o primeiro
> runtime Supabase + Redis e o outbox Frappe + Supabase foram validados somente
> em laboratórios descartáveis. Um gateway sintético chama agora os seis
> workflows HML completos; os filhos compactos remotos foram arquivados depois
> da migração. Os workflows completos da Miranda foram hidratados e executados
> no HML em `observe_only`. Nenhum canal ou provider
> real foi ativado, e os workflows operacionais originais não foram alterados.

Este documento fecha o desenho do workflow mestre omnichannel antes da conexão
dos cérebros e antes da escolha de um piloto. O ensaio descrito limita-se aos
alvos descartáveis identificados; produção, staging, workflows operacionais do
n8n, provedores, Vercel e integrações de clientes continuam sem autorização.

## 1. Estado do repositório

Antes desta especificação:

- o repositório conferido foi `/Users/arthurpimenta/Developer/lexia-crm`;
- o `HEAD` estava exatamente no commit `4bba3d425992af2308c6edce0e1214c40902fe35`;
- não havia commits posteriores nem alterações locais a incorporar;
- a `main` permaneceu em `8e13d2b977f068afbe4452aafcd7195afb102179`;
- foi criada a branch `codex/lote-2-workflow-mestre-omnichannel`, sem alterar a
  `main`;
- a referência Git inválida
  `refs/heads/codex/lote-1-autorizacao-workflows 2` continua presente e não foi
  removida, reparada ou reescrita. Por isso, comandos que enumeram todos os
  refs, como `git log --all`, ainda podem falhar; operações da branch atual
  continuam possíveis.

Os exports sanitizados em
`/Users/arthurpimenta/Downloads/Lexia_Workflows_Sanitizados_2026-10-05` foram
usados somente como material de leitura. Eles não serão importados, executados
ou tratados como implementação. Nenhum destino, ID de
credencial ou valor removido desses exports pode ser reutilizado.

A revisão funcional adicional usa, também somente em leitura, o arquivo
`/Users/arthurpimenta/Downloads/MIRANDA SKIN EXPERT -  OMNICHANNEL atualizado.json`.
Ele possui 148 nós e SHA-256
`550f85150d82d328b1f1e52059ef19d28cf33342cdddf5b7f9ed9c900fab7779`.
O arquivo está marcado como ativo e contém configuração inline potencialmente
sensível, incluindo tipos de token, chave de modelo, destinos privados e dados
operacionais. Por isso, não pode ser versionado, importado, ativado ou usado
como fonte de credenciais. Esta revisão extrai apenas topologia, nomes de nós,
tipos, campos e comportamento funcional sanitizado.

Depois da aprovação específica de 09/10/2026, os seis exports privados em
`Miranda Workflows.zip` passaram a ser também entrada somente leitura do
gerador de candidatos. O gerador copia apenas nós de lógica selecionados,
remove credenciais, IDs de webhook e destinos, e reestrutura os efeitos em
workflows novos e inativos. O ZIP e os exports brutos continuam fora do Git;
nenhum valor de credencial ou destino é herdado.

## 2. Objetivo e limites

O Lote 2 criará uma camada omnichannel comum, orientada a eventos, capaz de
receber canais e empresas diferentes sem copiar o fluxo inteiro para cada
cliente.

As fronteiras aprovadas são:

- o Supabase central guarda configurações não secretas e dados operacionais
  duráveis da plataforma;
- o Redis é compartilhado entre empresas dentro do ambiente, com isolamento
  explícito por ambiente, empresa, canal, conta e conversa;
- cada cérebro mantém seu próprio Supabase, prompts, memória privada e tools;
- Google Agenda e demais tools continuam configurados manualmente no cérebro
  de cada cliente;
- a plataforma e o workflow mestre não recebem credenciais do Supabase privado
  do cérebro nem credenciais do Google Agenda;
- o mestre recebe dos cérebros somente resultados e eventos de domínio do
  contrato versionado;
- cérebros nunca enviam mensagens diretamente aos provedores;
- nenhum cliente, canal ou provedor é escolhido como piloto neste documento;
- Asteric permanece fora da migração até seu escopo ser confirmado.

Também ficam fora da primeira implementação: conexão real com cérebros,
importação no n8n, criação de credenciais, ativação de webhooks, provisionamento
de Redis, aplicação de SQL, alteração da UI ativa e tráfego de produção.

## 3. Termos do contrato

- **Escopo da conversa:** combinação imutável de `environment`,
  `cliente_slug`, `channel`, `account_ref` e `conversation_ref`.
- **Conta:** identidade opaca de uma página, número ou instância de provedor.
  Não é uma credencial.
- **Mensagem humana:** mensagem enviada por um atendente do lado da empresa,
  no painel ou diretamente no canal. Mensagem recebida do lead não é
  intervenção humana.
- **Bloqueio:** motivo independente que impede uma ou mais ações automáticas.
- **Pendência:** mensagem recebida do lead enquanto uma ação automática está
  bloqueada.
- **Retomada:** transição que volta a permitir automação depois que todos os
  bloqueios aplicáveis terminam.
- **Ação de saída:** unidade idempotente que o mestre pode entregar ao
  provedor, como texto, mídia ou lembrete.
- **Cérebro:** subworkflow privado de um cliente que decide conteúdo e usa suas
  próprias tools, sem controlar entrega ou estado global.

## 4. Arquitetura alvo

```text
Canal / provedor
  |
  v
Adaptador de entrada autenticado
  |
  v
Workflow mestre omnichannel
  |-- normaliza, deduplica e persiste no Supabase central
  |-- aplica comandos de estado e projeta no Redis compartilhado
  |-- agrupa mensagens e monta contexto operacional
  |-- chama um cérebro pelo contrato versionado
  |-- valida eventos de domínio e ações propostas
  |-- faz o gate final contra bloqueios e versão da conversa
  `-- entrega por um adaptador de saída único
       |
       v
Canal / provedor

Plataforma Next.js
  |-- lê configuração, mensagens, handoffs e bloqueios no Supabase central
  `-- envia comandos autorizados de pausa/resolução/retomada

Cérebro privado do cliente
  |-- Supabase privado
  |-- prompts e memória privada
  `-- Google Agenda e outras tools
       |
       `-- devolve resposta estruturada e eventos de domínio ao mestre
```

O Supabase central é a fonte durável. O Redis contém uma projeção reconstruível
para baixa latência, buffer, leases e controle concorrente. Nenhum bloqueio,
handoff ou ação auditável pode existir apenas no Redis.

Todas as mutações de estado passam pelo mesmo contrato de comando. Eventos de
canal, eventos do cérebro e comandos da plataforma atualizam primeiro o estado
durável de forma idempotente e depois a projeção. Se a projeção falhar, a
conversa fica marcada para reprojeção; o erro não autoriza envio automático.

### 4.1 Agente de contexto compartilhado

O export atualizado confirma um `Agente de Contexto` comum no tronco do
omnichannel, mas seu prompt atual é literal e específico da Miranda. O Lote 2
preserva um único agente e um único node Set genérico, retirando do workflow o
prompt e o formato específico de cada empresa.

Fluxo obrigatório:

1. o adaptador autenticado resolve `environment`, `cliente_slug`, canal e
   conta; nenhum desses valores é aceito apenas do payload;
2. o mestre busca no Supabase central exatamente uma configuração ativa do
   agente de contexto para esse ambiente e empresa;
3. um validador confere tenant, versão, status, tamanho do prompt e schema dos
   campos específicos;
4. um único node `Set Context Agent Config` projeta os campos comuns para o
   agente compartilhado;
5. o agente recebe prompt, schema e pacote de mensagens somente da configuração
   validada naquele item;
6. a saída é validada antes de atualizar o contexto operacional.

Não existe prompt global como fallback. Configuração ausente, duplicada,
inativa, inválida ou pertencente a outro tenant produz
`context_config_unavailable`, mantém a mensagem já persistida e encerra o
processamento sem chamar cérebro ou entrega. Cache, quando existir, usa no
mínimo `environment + cliente_slug + config_version`; nunca usa "última
configuração carregada" nem uma linha sem tenant.

O Set recebe configuração e evento no mesmo item já validado. Ele não usa
`first()`, item global, static data ou referência posicional que possa escolher
a configuração da primeira empresa de um lote. A primeira implementação testa
itens A/B intercalados e execuções concorrentes.

Configuração central prevista:

| Campo | Finalidade |
| --- | --- |
| `cliente_slug` e `environment` | escopo exato resolvido pela integração confiável |
| `config_version` e `status` | versão imutável e seleção da única configuração ativa |
| `prompt_template` | instrução personalizada do agente de contexto, sem segredo |
| `common_schema_version` | versão da saída comum obrigatória |
| `company_fields_schema` | JSON Schema fechado para os campos específicos da empresa |
| `locale` e `timezone` | interpretação explícita, sem herdar valores de outro cliente |
| `model_policy_ref` | alias não secreto para a política comum de modelo |

Somente admin Lexia poderá criar ou ativar versões. O workflow lê a
configuração pelo caminho server-side; prompts não são enviados ao navegador.
O prompt do agente de contexto não é o prompt privado do cérebro e não contém
tools, credenciais ou instruções de envio.

### 4.2 Saída comum do contexto

O agente compartilhado devolve `lexia.context.result.v1`:

```json
{
  "schema_version": "lexia.context.result.v1",
  "scope": {
    "environment": "isolated_test",
    "cliente_slug": "empresa_sintetica_a",
    "channel": "whatsapp",
    "account_ref": "uuid",
    "conversation_ref": "opaque"
  },
  "context_call_id": "uuid",
  "config_version": "string",
  "source_message_ids": ["opaque"],
  "operational_context": {
    "summary": "string",
    "language": "pt-BR",
    "intent": "string",
    "topic": {
      "current": "string",
      "changed": false,
      "resumed_previous": false
    },
    "confidence": 0.9,
    "missing_information": [],
    "contact_updates": {},
    "scheduling_intent": {}
  },
  "company_fields": {}
}
```

Campos comuns descrevem apenas fatos operacionais necessários para contexto,
roteamento e retomada. `company_fields` é validado pelo schema da configuração
ativa. Para a Miranda, a compatibilidade inicial inclui, nesse namespace,
interesse de serviço, queixa principal, área/região, saúde relevante, primeira
visita, possível intercorrência e promoção mencionada. Data, horário e
profissional desejados ficam em `scheduling_intent`, pois são conceitos comuns.

O contexto operacional pode ser persistido no Supabase central e projetado no
Redis. Memória privada do cérebro, raciocínio, prompt privado, resultados
brutos de tools, IDs do Google Agenda e dados do Supabase privado nunca entram
nesse objeto. O cérebro recebe uma cópia do contexto operacional e mantém seus
dados privados em seu próprio ambiente.

Antes de montar o pedido ao cérebro, o mestre confere que `scope`,
`context_call_id`, `config_version` e a lista ordenada de
`source_message_ids` correspondem exatamente à chamada de contexto atual. Uma
saída de outra conversa ou empresa não é aceita, ainda que ambas usem a mesma
versão de configuração.

### 4.3 Idioma obrigatório do lead

Toda resposta ao lead deve usar o idioma atual da conversa entre português,
inglês e espanhol. A regra é aplicada em duas camadas:

1. o redator recebe o idioma resolvido como obrigatório e traduz integralmente
   o briefing interno, que pode continuar em português;
2. antes de formar o plano de entrega, o mestre confere o texto e as legendas
   propostos. Divergência clara produz `response_language_mismatch`, remove as
   ações de saída e termina sem chamar o provedor.

A mensagem mais recente do lead tem prioridade quando identifica claramente um
idioma ou pede uma troca explícita. O pedido explícito prevalece inclusive
quando a frase que o contém está escrita no idioma anterior, como `Gostaria de
ser atendido em espanhol`. Variações naturais misturando os nomes do idioma,
como `em espanol`, também são reconhecidas. Mensagens curtas e ambíguas, como `ok`, um
número ou conteúdo somente visual, preservam o idioma operacional já
estabelecido; elas nunca causam retorno automático ao português. Todos os
balões de uma resposta seguem o mesmo idioma. A decisão e o resultado do gate
são auditáveis, mas o texto privado do prompt não é exposto ao CRM.

Essa política não traduz nomes próprios ou conteúdo estritamente opaco e não
autoriza um terceiro idioma. No primeiro turno ambíguo, sem idioma anterior, o
runtime usa o locale configurado para a empresa; a fixture HML da Miranda usa
`pt` como locale inicial.

## 5. Identidade e isolamento no Redis

### 5.1 Escopo canônico

O mestre não aceita `cliente_slug` ou conta apenas porque vieram no corpo do
webhook. O adaptador autenticado identifica a conta, e o mestre resolve no
Supabase central o escopo permitido.

Formato lógico:

```text
environment | cliente_slug | channel | account_ref | conversation_ref
```

- `environment`: `local`, `isolated_test`, `staging` ou `production`;
- `cliente_slug`: tenant central já autorizado;
- `channel`: enum normalizado, inicialmente `whatsapp`, `instagram` ou
  `messenger`;
- `account_ref`: UUID opaco cadastrado no central;
- `conversation_ref`: identidade opaca vinculada ao identificador do provedor.

O identificador externo da conversa não aparece em texto puro na chave Redis.
O mestre calcula `scope_hash` com HMAC-SHA-256 e uma chave exclusiva do
ambiente. O segredo desse HMAC fica no runtime, nunca no Supabase ou no export
do workflow.

### 5.2 Prefixo planejado

```text
lexia:omni:v2:<environment>:<cliente_slug>:<channel>:<account_ref>:{<scope_hash>}:<resource>
```

As chaves do mesmo escopo usam o mesmo hash tag entre chaves para permitir
operações atômicas em Redis compatível com cluster. Os componentes aceitos são
validados por enum/UUID/padrão estrito; não há concatenação livre do payload.

Recursos previstos:

| Recurso | Estrutura | Finalidade |
| --- | --- | --- |
| `state` | hash | `state_version`, `delivery_epoch`, modo de retomada e contadores |
| `blocks` | hash | bloqueios ativos, um campo por `block_id` |
| `block_expiries` | sorted set | expirações agendadas, sem apagar outros motivos |
| `pending` | stream/lista limitada | mensagens aguardando decisão de retomada |
| `buffer` | stream/lista limitada | debounce de mensagens do lead |
| `context` | JSON versionado | projeção reconstruível do contexto operacional |
| `lease` | string com TTL | exclusão mútua e fencing da conversa |
| `dedupe:in:<hash>` | string com TTL | retry de entrada |
| `dedupe:out:<action_id>` | string com TTL | retry de entrega |

Ambientes sempre aparecem na chave. A recomendação operacional é também usar
instâncias ou credenciais distintas por ambiente; o namespace não será tratado
como substituto de separação física quando ela estiver disponível.

## 6. Estado e bloqueios independentes

### 6.1 Regra de composição

Não existe uma única chave `status` que possa representar todos os motivos. Um
bloqueio tem `block_id`, tipo, origem, timestamps, versão, eventual expiração e
metadata mínima. Encerrar um bloqueio atualiza somente aquele `block_id`.

Uma ação é permitida apenas quando nenhum bloqueio ativo aplicável a proíbe:

```text
allowed(action) = todos os bloqueios aplicáveis permitem action
```

Portanto, expirar a intervenção humana não remove uma pausa manual; resolver um
handoff não remove um bloqueio de agendamento; remover um agendamento não remove
outro agendamento ou handoff.

### 6.2 Tipos iniciais

| Tipo | Criação/renovação | Término | Ações automáticas |
| --- | --- | --- | --- |
| `human_intervention` | toda mensagem de atendente cria ou reinicia o prazo configurado | expiração; remoção administrativa excepcional e auditada | bloqueia respostas, follow-ups e lembretes |
| `manual_pause` | comando autorizado, com prazo ou indefinido | comando explícito ou expiração | bloqueia toda saída automática |
| `handoff` | solicitação validada do cérebro cria uma pendência e um bloco próprio | exige handoff resolvido e comando manual separado de retomada | bloqueia toda saída automática |
| `appointment` | evento de tool atestado cria um bloco por agendamento **somente se a política da empresa ativar a pausa pós-agendamento** | término original do evento ou remoção manual | bloqueia respostas/follow-ups; permite somente a confirmação única e os lembretes do próprio evento confirmado |

Pausas administrativas por empresa inativa continuam seguindo as regras de
contenção do Lote 1 e não são substituídas por este modelo.

### 6.3 Intervenção humana

1. Um eco de saída é comparado por ID do provedor com uma ação automática já
   registrada.
2. Se não corresponder a uma ação automática e tiver autoria da conta da
   empresa, é intervenção humana.
3. A mensagem é persistida com origem humana.
4. O bloqueio determinístico de intervenção daquela conversa é criado ou tem
   `expires_at` reiniciado usando a política da empresa.
5. `state_version` e `delivery_epoch` avançam, mesmo quando o prazo apenas foi
   renovado.
6. Qualquer resposta preparada com versão anterior perde o gate de entrega.

Eventos podem chegar fora de ordem. Uma intervenção atrasada é registrada e
avança a versão, mas seu vencimento nunca substitui por um prazo menor aquele
calculado a partir de uma mensagem humana mais recente.

Impressão digital de texto, usada nos fluxos atuais, não será a identificação
primária de eco. Ela pode existir apenas como fallback degradado e auditável
quando o provedor não oferecer ID.

### 6.4 Retomada

Cada política de empresa define:

- `await_new_message`: padrão. Quando o último bloqueio termina, nenhuma
  pendência é respondida automaticamente. A próxima mensagem do lead abre uma
  nova execução e pode levar as mensagens pendentes como contexto.
- `answer_pending`: quando o último bloqueio termina, o mestre cria uma única
  execução idempotente com as mensagens pendentes ainda válidas.

O encerramento de um bloqueio só avalia retomada quando a contagem efetiva de
bloqueios aplicáveis chega a zero. Se um novo bloqueio surgir durante a
preparação da resposta, o gate final a suprime.

### 6.5 Handoff

- Uma solicitação válida cria uma linha durável em `lexia_handoffs`, um evento
  de estado e um bloqueio com o mesmo identificador de correlação.
- Retry do mesmo pedido devolve o mesmo handoff; não cria outra pendência.
- Alterar o status para `resolvido` ou `perdido` não retoma a IA.
- A retomada é um segundo comando explícito e só é aceita para handoff já
  encerrado.
- Retomar esse handoff remove apenas seu bloqueio.
- Na primeira versão, nenhum texto livre do modelo pode remover, resolver ou
  retomar handoff.
- Uma mensagem automática de confirmação de transferência não será liberada
  até existir decisão específica de produto; o padrão seguro é não enviar.

### 6.6 Agendamento e política pós-agendamento

A pausa pós-agendamento é uma configuração por empresa, salva no Supabase
central em `lexia_omnichannel_policies` e editada pela plataforma. Não existe
condição fixa por cliente no código nem valor implícito: política ausente,
duplicada, inativa ou inválida falha fechado (`omnichannel_policy_unavailable`).
Valores iniciais aprovados em 08/10/2026: Miranda ligada, Detail desligada.
Novas empresas usam o mesmo controle e precisam de escolha explícita.

- **Ligada:** o evento confirmado cria o bloqueio até `ends_at` e admite uma
  única confirmação vinculada à tool (regras abaixo), respeitando os demais
  bloqueios.
- **Desligada:** o agendamento é registrado (lembretes, cancelamento e
  métricas continuam), mas não cria bloqueio; respostas e follow-ups seguem
  normalmente e os demais bloqueios continuam valendo.

O mestre não consulta Google Agenda nem o Supabase privado do cérebro. O
cérebro devolve um evento `appointment.confirmed` construído a partir do
resultado real da tool, e não de texto livre do modelo.

O evento precisa conter ao menos:

- referência opaca do agendamento;
- `starts_at`, `ends_at` e timezone explícito;
- identificador da tool/chamada que originou o evento;
- estado `confirmed`;
- chave idempotente.

Regras:

Regras com a pausa ligada (cancelamento, lembretes e remoção valem também
para a pausa desligada, exceto o que depende do bloqueio):

1. O evento cria um bloqueio até `ends_at`.
2. Respostas e follow-ups normais ficam proibidos.
3. Somente lembretes do mesmo agendamento podem passar, desde que nenhum
   bloqueio global, como pausa manual, handoff ou intervenção humana, os proíba.
4. Um evento `appointment.cancelled` altera o estado do mesmo bloqueio para
   cancelado, mas preserva a expiração original.
5. Agendamento cancelado não gera lembretes.
6. Remoção manual encerra apenas o bloco daquele agendamento e mantém seus
   lembretes; pausa manual, intervenção humana, handoff e o bloqueio de outro
   agendamento continuam bloqueando. Lembrete nunca sai depois do início do
   agendamento.
7. Expiração encerra apenas aquele motivo, sem afetar outros bloqueios.
8. Se o bloco já foi removido ou expirou quando o cancelamento chega, o
   agendamento ainda muda para cancelado e seus lembretes são negados, sem
   recriar a pausa encerrada.

Confirmação única (ação `appointment_confirmation`), aprovada em 08/10/2026:

- no máximo uma por resultado do cérebro, sempre a última ação, com
  `source_ref` igual à referência do agendamento;
- precisa de um `appointment.confirmed` atestado no mesmo resultado ou, em
  reprocessamento, de um `appointment.create` já executado e informado em
  `reprocess.executed_tool_effects`;
- com a pausa ligada, as demais ações do mesmo resultado são descartadas e só
  a confirmação entra no plano; com a pausa desligada, todas seguem;
- se nada mais mudou na conversa entre a chamada ao cérebro e a aplicação dos
  eventos, as ações passam a usar o estado produzido pelos próprios eventos;
  qualquer outra mudança, como intervenção humana, mantém o estado antigo e o
  gate suprime as ações;
- o gate só a libera com agendamento confirmado, antes do início e se nenhuma
  outra confirmação já tiver sido entregue para ele; pausa manual,
  intervenção, handoff e outro agendamento continuam bloqueando;
- cancelamento não ganha exceção implícita.

O registro da confirmação entregue precisa ocorrer na mesma transação do
claim de entrega no runtime real.

## 7. Proteção contra respostas atrasadas

Toda invocação do cérebro recebe `state_version` e `delivery_epoch`. Toda ação
proposta conserva esses valores.

Antes de enviar, o mestre:

1. valida novamente escopo, empresa, conta e ação;
2. adquire lease com fencing por conversa;
3. remove expirações vencidas de forma atômica;
4. compara a versão capturada com a versão atual;
5. avalia todos os bloqueios aplicáveis;
6. registra ou reivindica o `action_id` idempotente;
7. somente então chama o adaptador do provedor;
8. persiste ID/status do provedor e libera o lease.

Uma intervenção humana aceita antes do passo 6 avança `delivery_epoch` e faz a
ação antiga terminar como `suppressed_state_changed`, sem chamar o provedor.
Depois do claim, a ação deixa de estar "em preparação" e passa a estar em
entrega. O lease serializa entrega e intervenção, criando uma ordem única para
o teste concorrente.

O cérebro, os subworkflows de contexto e os fluxos shadow não possuem
credencial de envio. Assim, não existe caminho alternativo que contorne o gate.

### 7.1 Mensagem nova do lead durante a resposta

Regra aprovada em 08/10/2026. Cada mensagem do lead avança `lead_message_seq`,
um contador separado de `state_version`/`delivery_epoch`. O plano de uma
resposta guarda o último número incluído no lote (`lead_cutoff_seq`). Antes de
cada bolha, depois do gate de bloqueios:

1. se algum bloqueio impede a ação, ela é suprimida pelo bloqueio e **não** há
   reprocessamento; as mensagens seguem como pendência;
2. se chegou mensagem do lead depois do corte, a bolha atual e as seguintes
   são descartadas (`superseded_by_new_message`), nunca reenviadas;
3. bolhas já confirmadas permanecem `sent` e não se repetem;
4. eventos de domínio da invocação descartada já foram aplicados ao estado de
   forma idempotente e são preservados; o `context_patch` dela não é aplicado,
   porque pode descrever uma resposta que não saiu;
5. as mensagens do lote descartado voltam ao buffer junto com as novas, e o
   novo pedido ao cérebro leva o bloco `reprocess` com as invocações
   descartadas, as ações entregues e as tools que já tiveram efeito;
6. o mestre rejeita ação do novo resultado que reutilize um `action_id` já
   entregue, e um evento de agendamento repetido com a mesma referência é
   duplicado, sem novo bloqueio nem nova versão.

Não há limite artificial de repetições: cada reprocessamento exige uma
mensagem real nova do lead, que também reinicia a janela do buffer.
Lembretes não usam corte e não são descartados por mensagem do lead.


## 8. Workflow mestre e subworkflows

### 8.1 Mestre

`OMNI v2 - Master` recebe somente eventos canônicos. Adaptadores de provedor
ficam antes dele; cérebros e entrega ficam atrás dele.

Sequência:

1. validar schema, assinatura interna, timestamp e replay;
2. resolver conta, tenant, ambiente, política e versão de configuração;
3. registrar/deduplicar o evento de entrada;
4. persistir contacto e uma mensagem por evento;
5. detectar eco automático ou intervenção humana;
6. aplicar o comando de estado correspondente;
7. normalizar mídia, preservando o evento original e seu estado mesmo se
   download, extração ou transcrição falhar;
8. encerrar cedo se o evento não exigir cérebro ou se a conversa estiver
   bloqueada;
9. carregar e validar a configuração exata do agente de contexto;
10. inserir no buffer e eleger uma única execução por lote;
11. buscar histórico pelo escopo completo e montar contexto operacional;
12. executar o agente de contexto compartilhado e validar sua saída;
13. capturar o snapshot de estado e chamar o cérebro configurado pelo
    contrato, nunca por slug codificado no fluxo;
14. validar a resposta e os eventos de domínio;
15. aplicar handoff/agendamento/contexto antes da entrega;
16. executar o gate de saída por ação;
17. entregar sequencialmente no adaptador autorizado;
18. persistir resultado por ação, métricas técnicas e erro sanitizado.

Webhooks de provedor respondem rapidamente depois de validar e registrar a
entrada. Esperas longas não ficam em nós `Wait`: expiração e retomada são
tratadas por eventos e por um varredor idempotente.

### 8.2 Subworkflows reutilizáveis

| Nome planejado | Responsabilidade |
| --- | --- |
| `OMNI v2 - Adapter Ingress` | converter payload de um provedor em evento canônico; uma variante por provedor |
| `OMNI v2 - Resolve Scope` | ligar credencial/conta ao tenant e carregar política ativa |
| `OMNI v2 - Ingest` | deduplicar, criar/atualizar contacto e persistir mensagem/evento |
| `OMNI v2 - State Command` | aplicar bloqueios, versões, pendências e outbox de projeção |
| `OMNI v2 - Project Redis` | projetar/reconstruir estado no namespace v2 |
| `OMNI v2 - Media Normalize` | baixar/processar áudio, imagem, PDF ou vídeo sem controlar estado nem envio |
| `OMNI v2 - Buffer Context` | debounce, lote de mensagens e contexto operacional |
| `OMNI v2 - Context Config` | buscar por tenant e validar prompt/schema sem fallback cruzado |
| `OMNI v2 - Context Agent` | executar o agente compartilhado e devolver `lexia.context.result.v1` |
| `OMNI v2 - Invoke Brain` | resolver `brain_ref`, chamar subworkflow e impor timeout/contrato |
| `OMNI v2 - Apply Brain Result` | validar contexto, handoff e eventos de domínio atestados |
| `OMNI v2 - Handoff` | criar/resolver/retomar handoff de forma idempotente |
| `OMNI v2 - Appointment Policy` | confirmar, cancelar, expirar e validar lembretes |
| `OMNI v2 - Delivery Gate` | revalidar versão/bloqueios e reivindicar `action_id` |
| `OMNI v2 - Provider Send` | único ponto com credencial de saída, por adaptador |
| `OMNI v2 - Expiry Resume` | expirar motivos individualmente e executar a política de retomada |
| `OMNI v2 - Recovery` | reprojetar Redis e reconciliar ações/eventos incompletos |

Os subworkflows recebem e devolvem objetos versionados. Nenhum depende do nome
visual de outro nó para localizar dados.

No áudio de intervenção, `State Command` e a persistência do evento humano
acontecem antes de `Media Normalize`. Falha de download/transcrição atualiza
`transcription_status = failed` e um código sanitizado, sem remover a pausa,
sem perder a mensagem original e sem prosseguir para cérebro ou saída.

## 9. Contrato dos cérebros

### 9.1 Entrada `lexia.brain.request.v1`

Campos principais:

```json
{
  "schema_version": "lexia.brain.request.v1",
  "invocation_id": "uuid",
  "correlation_id": "uuid",
  "scope": {
    "environment": "isolated_test",
    "cliente_slug": "empresa_sintetica_a",
    "channel": "whatsapp",
    "account_ref": "uuid",
    "conversation_ref": "opaque"
  },
  "state": {
    "state_version": 12,
    "delivery_epoch": 7
  },
  "messages": [],
  "contact": {},
  "operational_context": {},
  "company_fields": {},
  "policy": {},
  "capabilities": []
}
```

Regras:

- somente campos necessários e limites de tamanho definidos em schema;
- PII apenas quando indispensável ao atendimento, nunca em logs de teste;
- sem service role central, senha, token de provedor, credencial Redis, URL
  privada ou credencial do Google;
- histórico vem do central/contexto permitido, não por consulta livre do
  cérebro ao banco da plataforma;
- `operational_context` e `company_fields` já passaram pelo schema do agente de
  contexto; memória privada do cérebro não retorna nesse campo;
- `capabilities` limita os eventos que aquele cérebro pode devolver;
- `reprocess`, opcional, aparece só quando uma resposta não enviada foi
  descartada por mensagem nova do lead (seção 7.1); lista invocações
  descartadas, ações já entregues e efeitos de tools já executados, que o
  cérebro não deve repetir.

### 9.2 Saída `lexia.brain.result.v1`

Campos principais:

```json
{
  "schema_version": "lexia.brain.result.v1",
  "invocation_id": "uuid",
  "captured_state": {
    "state_version": 12,
    "delivery_epoch": 7
  },
  "decision": "reply",
  "actions": [],
  "context_patch": {},
  "domain_events": [],
  "tool_audit": []
}
```

Valores iniciais de `decision`: `reply`, `no_reply`, `handoff` ou `error`.

Regras:

- cada ação possui `action_id`, tipo, conteúdo limitado e ordem;
- não há URL de provedor nem comando HTTP;
- o mestre pode rejeitar, suprimir ou truncar conforme contrato; o cérebro não
  controla entrega;
- `context_patch` usa allowlist e tamanho máximo;
- handoff tem motivo, resumo e prioridade validados;
- evento de agendamento só é aceito com proveniência de tool estruturada,
  construída fora do texto livre do modelo;
- `captured_state` e o snapshot de cada ação precisam coincidir com o pedido
  original;
- tipo desconhecido, campo inesperado crítico, versão incompatível ou ID
  divergente falham fechado;
- `tool_audit` contém nome lógico, invocação, operação, resultado e eventual
  referência opaca do agendamento, nunca argumentos secretos ou resposta bruta
  da tool;
- `availability.check` não atesta `appointment.confirmed`; confirmação exige
  uma operação `appointment.create` bem-sucedida com a mesma referência, e
  cancelamento exige `appointment.cancel` equivalente.

### 9.3 Destino do cérebro

O Supabase central guarda apenas um `brain_ref` lógico e capacidades
declaradas. A associação entre esse alias, o subworkflow n8n e suas credenciais
privadas fica no n8n. A plataforma não recebe o ID interno, banco privado ou
tools do cérebro.

### 9.4 Cérebro e tools continuam separados

`OMNI v2 - Invoke Brain` é somente uma fronteira de contrato. Ele não incorpora
os nós, prompts ou tools do cérebro ao mestre. O subworkflow privado recebe
`lexia.brain.request.v1` e devolve `lexia.brain.result.v1`.

Tools são chamadas dentro do cérebro. Um adaptador determinístico do cérebro
transforma resultados reais de tools em `lexia.domain.event.v1`; o modelo não
escreve livremente esse envelope. O mestre aceita somente tipo/capacidade
declarados no `brain_ref`, `invocation_id` coerente e chave idempotente. Dados
brutos e credenciais da tool permanecem privados.

Essa correlação local ainda não autentica o evento. A integração real deverá
provar que o registro de auditoria foi criado pelo adaptador determinístico da
tool e não pelo texto do modelo.

### 9.5 Lembretes e follow-ups continuam separados

Workflows de lembrete e follow-up não são incorporados ao mestre e não recebem
credencial de envio. Quando chega o momento de agir, enviam ao mestre:

```json
{
  "schema_version": "lexia.automation.request.v1",
  "request_id": "uuid",
  "kind": "appointment_reminder",
  "scope": {},
  "source_ref": "opaque",
  "due_at": "date-time",
  "proposed_actions": []
}
```

Valores iniciais de `kind`: `appointment_reminder` e `followup`. O mestre
resolve novamente conta, política, estado e evento de origem. Lembrete precisa
referenciar agendamento confirmado e não cancelado; follow-up precisa
referenciar regra/agendamento persistido e ainda válido. Ambos passam pelo
mesmo `Delivery Gate` de respostas comuns.

Resposta comum:

```json
{
  "request_id": "uuid",
  "status": "accepted|suppressed|duplicate|rejected",
  "reason": "machine_code",
  "action_ids": []
}
```

Pausa manual, intervenção humana, handoff ou mudança de versão pode suprimir a
automação. O workflow separado recebe o resultado e nunca tenta enviar por uma
rota alternativa. Cancelamento, retry e reconciliação usam `request_id` e
`action_id`; não usam chaves de pausa próprias.

## 10. Dados planejados no Supabase central

O schema final será aditivo e passará por revisão separada antes de qualquer
SQL. Nomes previstos:

| Tabela/alteração | Papel |
| --- | --- |
| `lexia_channel_accounts` | conta opaca por ambiente, tenant, canal, provedor e adaptador; sem credenciais |
| `lexia_omnichannel_policies` | prazo humano, modo de retomada, capacidades e política de agendamento/lembrete, incluindo `pause_after_appointment boolean not null` sem default; seeds iniciais Miranda `true` e Detail `false` |
| `lexia_context_agent_configs` | prompt versionado, schema comum e campos específicos por empresa; sem segredo |
| `lexia_brain_bindings` | `brain_ref` lógico, versão de contrato e capacidades, sem destino secreto |
| `lexia_conversation_states` | projeção durável de versão, epoch, pendências e modo de retomada |
| `lexia_conversation_blocks` | um registro por motivo independente, com status e expiração |
| `lexia_conversation_state_events` | log append-only e idempotente de comandos/transições |
| `lexia_ingress_events` | deduplicação e auditoria mínima da entrada, com retenção definida |
| `lexia_outbound_actions` | preparação, supressão, claim, entrega, retry e ID do provedor |
| `lexia_automation_requests` | pedidos idempotentes de lembrete/follow-up e resultado do gate compartilhado |
| `lexia_appointment_events` | projeção central dos eventos atestados de confirmação/cancelamento |
| `lexia_conversation_contexts` | snapshot reconstruível e versionado do contexto operacional |
| `lexia_omnichannel_projection_outbox` | reprojeção confiável do central para Redis |
| `lexia_handoffs` | adicionar escopo, `block_id`, idempotência, resolução e retomada separadas |
| `lexia_contactos` | adicionar conta e identidade canônica da conversa |
| `lexia_mensagens` | adicionar IDs/timestamps/status do provedor e `action_id`, conforme o plano de fidelidade |

Constraints mínimas:

- escopo completo em todas as tabelas operacionais;
- unicidade de conta dentro de ambiente/provedor;
- no máximo uma configuração de contexto ativa por ambiente e empresa;
- unicidade de evento de entrada por conta e ID do provedor;
- unicidade de `action_id` e de mensagem do provedor dentro do escopo;
- versão monotônica da conversa;
- enums/checks para tipos, status e modos de retomada;
- FK entre handoff/agendamento, bloco e conversa;
- escrita operacional somente por caminhos server-side autorizados;
- leitura de cliente pelo helper endurecido do Lote 1 e pelo próprio tenant;
- admin Lexia global conforme a regra já aprovada;
- payload bruto não é retenção padrão.

Configuração de contexto é selecionada pelo mesmo escopo confiável da conta.
Uma query sem `environment` e `cliente_slug`, resultado com mais de uma linha
ativa ou schema incompatível é erro de configuração, nunca autorização para
usar um prompt padrão ou de outro cliente.

O schema incluirá RPCs transacionais para aplicar comando de estado e
reivindicar ação de saída. Atualizações ad hoc por `authenticated` não serão
permitidas.

Eventos de agendamento necessários ao painel serão espelhados como dados de
domínio no central. Isso permitirá retirar, em fase posterior e validada, a
dependência direta da plataforma dos Supabases privados sem conectar a
plataforma ao Google Agenda.

## 11. Alterações planejadas na plataforma

1. Substituir `clientConfigs` de Redis em código por configuração não secreta
   no central e credencial server-side por ambiente.
2. Trocar leitura de três chaves legadas por uma lista de bloqueios duráveis,
   com tipo, origem, prazo e estado separados.
3. Fazer pausa e retomada enviarem comandos idempotentes; não executar `DEL`
   amplo ou por tipo sem identificar o `block_id`.
4. Separar na UI `resolver handoff` de `retomar IA`.
5. Mostrar que outros bloqueios continuam ativos depois de uma retomada.
6. Permitir pausa manual com prazo ou indefinida.
7. Configurar prazo de intervenção e modo de retomada por empresa.
7a. Controle "Pausar IA após agendamento confirmado" (ligado/desligado) na
    configuração de cada empresa, gravado em `lexia_omnichannel_policies`
    por Server Action autorizada, com versão e auditoria de quem alterou.
    O texto da tela explica as duas opções: ligada envia uma confirmação
    única e pausa até o término do evento; desligada não pausa. Ambas
    respeitam os demais bloqueios. O cadastro de nova empresa exige escolha
    explícita, sem valor pré-selecionado. Permissão aprovada em 08/10/2026:
    somente o admin Lexia altera; o cliente apenas visualiza. O banco aplica a
    regra nas RPCs `lexia_omni_create_policy` e
    `lexia_omni_set_appointment_pause` (`lexia_is_admin()` na sessão do
    usuário), além da checagem da Server Action. A mesma política vale para
    WhatsApp, Instagram e Messenger, apenas na conversa em que o agendamento
    ocorreu; outras conversas do mesmo lead não são vinculadas nem pausadas.
8. Exibir estado de projeção degradada sem liberar automação por ausência do
   Redis.
9. Consumir mensagens/eventos fiéis, mantendo compatibilidade visual com o
   legado.
10. Preservar as regras do Lote 1: autorização central, empresa ativa para
    novas operações e service role somente no servidor.
11. Criar, em fase posterior, gestão administrativa versionada do prompt e
    schema do agente de contexto; cliente não edita prompt nesta primeira
    versão.
12. Exibir mídia e transcrição com estados `pending`, `completed`, `failed` ou
    `not_supported`, sem substituir o evento original pela transcrição.
13. Exibir origem de anúncio somente quando houver marcador estruturado do
    provedor; nunca deduzir anúncio por `followup_rapido`.

A UI ativa e `lib/redis/agent-locks.ts` não serão alterados na primeira
implementação. A substituição ocorrerá atrás de feature flag e depois de
ensaio isolado.

## 12. Idempotência, concorrência e entrega única

Identificadores independentes:

- `event_id`: evento canônico recebido;
- `provider_event_id`: retry do provedor;
- `correlation_id`: percurso ponta a ponta;
- `invocation_id`: chamada específica do cérebro;
- `state_command_id`: mutação de estado;
- `action_id`: efeito de saída único;
- `projection_id`: atualização do Redis.

Tuplas de idempotência são serializadas de forma estrutural e versionada. Não
se concatenam campos com um separador aceito dentro dos próprios IDs; assim,
conversa e evento contendo `|` continuam sem colisão.

Regras:

- retry de entrada retorna o resultado já conhecido;
- um lote elege uma única invocação por lease/fencing;
- retry do cérebro não cria outra ação com o mesmo `action_id`;
- só `Provider Send` possui credenciais de saída;
- entrega exige claim único no central e no Redis;
- status final não volta para estado anterior;
- falha depois de resposta ambígua do provedor entra em reconciliação, não em
  retry cego;
- mudança de estado entre geração e entrega suprime a ação;
- fluxo shadow sempre recebe `delivery_mode = observe_only` e falha fechado se
  tentar enviar.
- exceção na leitura do estado interrompe o plano antes do envio e preserva
  itens já confirmados; exceção durante o envio é tratada como
  `delivery_unknown`, pois o provedor pode ter aceitado a ação.

Uma resposta composta vira um plano ordenado de ações. Texto, imagem e legenda
não são reconstruídos a partir de uma string: cada item possui `action_id`,
`sequence`, tipo, conteúdo e eventual `caption` atômica. O adaptador só começa
`sequence + 1` depois de confirmar a anterior.

Em entrega parcial:

- ações já confirmadas ficam `sent` e nunca são repetidas;
- falha determinística marca a ação atual como `failed` e não inicia as
  seguintes;
- resposta ambígua do provedor marca `delivery_unknown` e exige reconciliação
  por ID, sem retry cego;
- retry retoma pelo primeiro item elegível, mantendo os mesmos `action_id`;
- uma intervenção humana antes de cada novo claim invalida o restante do plano;
- imagem e sua legenda são uma ação única quando o provedor suporta caption;
  quando não suporta, a separação vira duas ações ordenadas explícitas.

## 13. Testes com duas empresas sintéticas

Fixtures usarão apenas `empresa_sintetica_a` e `empresa_sintetica_b`, contas
UUID, conversas opacas, domínios `.invalid` e conteúdo fictício. Nenhum dado,
slug, destino ou credencial de cliente real será copiado.

### Isolamento

- mesmo canal e mesmo identificador externo em duas empresas geram escopos e
  chaves diferentes;
- duas contas do mesmo canal na mesma empresa não colidem;
- `local`, `isolated_test`, `staging` e `production` não colidem;
- evento, contexto, bloco ou ação de A nunca pode ser lido/aplicado em B;
- payload que tenta trocar tenant/conta é rejeitado antes de efeitos;
- prompt de A nunca é carregado para B, inclusive com cache quente e versões
  iguais;
- itens A/B intercalados não fazem o Set genérico escolher a configuração do
  primeiro item;
- configuração ausente em B falha fechado em vez de reutilizar a de A;
- históricos com o mesmo identificador externo em A e B continuam isolados
  por ambiente, tenant, canal e conta.
- a política pós-agendamento é resolvida só pelo ambiente e empresa do
  escopo: A ligada e B desligada, com o mesmo canal e identificador externo,
  produzem bloqueio apenas em A; consultas intercaladas não trocam valores;
  política ausente, duplicada, inativa, de outro ambiente ou sem escolha
  explícita falha fechado; alterar a política de B não altera A.
- resultado de contexto de outra conversa, tenant ou chamada é rejeitado mesmo
  com a mesma `config_version`, assim como uma lista de mensagens de origem
  divergente.

### Idioma

- primeira mensagem clara em português, inglês ou espanhol estabelece o idioma;
- uma troca explícita ou mensagem clara em outro idioma muda a resposta no
  mesmo turno, inclusive dentro da mesma conversa;
- `ok`, números, emojis e outras entradas ambíguas preservam o idioma anterior;
- todos os balões e legendas da resposta usam o mesmo idioma esperado;
- uma ação claramente escrita em outro idioma termina suprimida com
  `response_language_mismatch` e não alcança o provider;
- idioma e histórico de uma empresa/conversa não contaminam outra.

### Pausas e retomada

- cada mensagem de atendente cria ou reinicia o prazo;
- evento humano atrasado não reduz o prazo criado por evento mais recente;
- mensagem do lead não cria intervenção humana;
- eco da própria IA não cria intervenção;
- pausa manual temporária expira só ela;
- pausa manual indefinida exige remoção explícita;
- falha no download ou na transcrição de áudio da equipe preserva mensagem,
  autoria e bloqueio humano, sem chamar cérebro ou saída;
- `await_new_message` não responde pendências ao expirar;
- `answer_pending` cria uma única execução ao terminar o último bloqueio;
- encerrar um de vários bloqueios preserva todos os demais.

### Handoff e agendamento

- handoff repetido é idempotente;
- resolver sem retomar mantém bloqueio;
- retomar handoff aberto é negado;
- retomada válida remove somente o bloco do handoff;
- confirmação cria bloqueio até o fim do evento;
- apenas lembrete do evento confirmado pode passar pelo bloco de agendamento;
- remover manualmente o bloco do agendamento mantém seu lembrete, que segue
  negado por pausa manual, intervenção, handoff ou outro agendamento;
- outro bloqueio global ainda impede esse lembrete;
- cancelamento preserva o bloqueio e suprime lembretes;
- cancelamento recebido após remoção ou expiração atualiza o agendamento sem
  recriar seu bloqueio;
- término ou remoção manual de um agendamento não remove outros motivos.

### Corridas e duplicação

- intervenção antes do gate suprime resposta já preparada;
- mensagem nova do lead depois do corte descarta as bolhas não enviadas,
  preserva as enviadas e devolve o lote ao buffer para reprocessamento;
- bloqueio tem precedência sobre mensagem nova e não dispara reprocessamento;
- mensagem que chega com um lote em processamento fica para o lote seguinte;
- gate antes da intervenção estabelece ordem e não duplica ação;
- retry do mesmo evento humano não duplica mensagem nem renova o prazo duas
  vezes;
- eventos diferentes com o mesmo conteúdo continuam sendo duas mensagens;
- retry de envio não duplica bolha;
- falha na segunda ação de uma resposta composta preserva a primeira como
  enviada, impede a terceira e retoma sem repetir a primeira;
- estado `delivery_unknown` não faz retry até a reconciliação;
- exceções depois de entregas confirmadas preservam esse progresso; exceção de
  envio marca a ação atual como incerta;
- intervenção entre duas ações interrompe o restante do plano;
- duas execuções concorrentes elegem uma única dona do buffer;
- reconciliação de projeção não reabre bloqueio encerrado nem encerra ativo;
- workflow shadow não possui caminho de saída;
- resposta inválida ou evento de tool sem atestado falha fechado.
- disponibilidade bem-sucedida, operação incorreta, referência divergente ou
  snapshot alterado não atestam confirmação de agendamento;
- exemplos positivos e negativos exercitam os schemas completos, inclusive
  ações/eventos internos e regras personalizadas não suportadas.

Os testes de contrato e máquina de estado serão locais. Testes de Redis,
Supabase, n8n e runtime terão harness separado, manifesto de dados sintéticos,
identidade explícita do ambiente e autorização própria antes de qualquer
escrita.

## 14. Migração, comparação e rollback

### 14.1 Comparação sem mensagens duplicadas

1. Um único ingress recebe o evento do provedor.
2. O fluxo atual continua como único `delivery_owner`.
3. Uma cópia canônica pode alimentar o v2 em `observe_only`.
4. O v2 não recebe credencial de provedor no shadow e o gate também recusa
   qualquer ação.
5. Resultados são comparados por IDs de correlação, nunca reenviados.
6. A troca de dono é atômica por conta: desabilitar saída v1, confirmar e só
   então habilitar v2.
7. Não manter dois webhooks independentes capazes de responder ao mesmo evento.

### 14.2 Preservar pausas e handoffs na migração

- Antes do corte, inventariar chaves legadas sem registrar valores sensíveis.
- Importar cada pausa ativa como bloco `legacy_import`, preservando expiração
  restante ou caráter indefinido.
- Handoffs centrais existentes permanecem; nenhuma linha é recriada ou
  apagada automaticamente.
- Durante convivência, comandos da plataforma gravam o estado central e o
  bridge v1 recalcula uma trava legada agregada.
- O bridge só apaga a trava agregada quando nenhum bloqueio v2 compatível
  continua ativo; nunca traduz "encerrou um motivo" para `DEL` cego.
- O v1 não se torna fonte de verdade de novos estados depois do corte.

### 14.3 Rollback

Rollback operacional troca `delivery_owner` para o v1 e mantém:

- tabelas e eventos do v2;
- bloqueios e handoffs criados durante a migração;
- projeção Redis v2 para futura retomada;
- bridge de compatibilidade que mantém o v1 pausado enquanto houver qualquer
  motivo ativo;
- registros de deduplicação e ações já enviadas.

O rollback não apaga schema, não limpa Redis v2 e não marca handoff como
resolvido. Ao retornar ao v2, o estado é reprojetado do central. Rollback de
migration destrutivo não fará parte do procedimento normal; uma remoção futura
exigirá backup restaurado, retenção cumprida e aprovação separada.

## 15. Comparação das capacidades atuais

A classificação abaixo usa o export atualizado da Miranda como referência
funcional. "Preservar" não significa copiar nós ou expressões: significa manter
o comportamento através do contrato novo.

| Capacidade observada | Decisão | Destino e correção necessária |
| --- | --- | --- |
| Identificação de empresa em `Config Cliente Lexia` | **Corrigir** | Resolver conta/tenant pela integração confiável; retirar slug, tokens, URLs e configuração literal do workflow |
| Agente de contexto e contexto ativo | **Preservar no mestre** | Um agente compartilhado, prompt/schema central por empresa, Set genérico e falha fechada sem fallback cruzado |
| Áudio enviado pela equipe e transcrição | **Preservar no adaptador; corrigir** | Aplicar pausa/persistir primeiro; download/transcrição assíncronos não podem apagar pausa nem mensagem em caso de falha |
| Autoria humana, IA e lead | **Preservar no mestre; corrigir** | Derivar por IDs/eventos do provedor e ações registradas, não apenas texto ou `from_me`; persistir origem estruturada |
| Busca e montagem de histórico | **Preservar no mestre; corrigir** | Consultar pelo escopo completo, ordenar por timestamp/ID do provedor e nunca misturar contas ou tenants |
| Texto recebido | **Preservar no adaptador** | Normalizar um evento por mensagem, conservar ID/timestamp e passar ao buffer idempotente |
| Áudio recebido do lead | **Preservar em `Media Normalize`** | Conservar mídia original e status de transcrição; falha controlada pode gerar contexto de mídia indisponível, sem inventar texto |
| Imagem e legenda recebidas | **Preservar em `Media Normalize`** | Separar mídia/caption, limites e status; modelo de visão é infraestrutura compartilhada, não tool do cérebro |
| PDF recebido | **Preservar em `Media Normalize`** | Extrair com limites de tamanho/páginas; manter evento original e falhar fechado em conteúdo não suportado |
| Vídeo recebido | **Preservar em `Media Normalize`; conexão adiada** | Versionar contrato e fixture agora; conectar analisador real somente no harness aprovado |
| Eventos e filtros Meta | **Preservar no adaptador Meta; corrigir** | Validar assinatura/conta, normalizar mensagens, ecos, postbacks, stories e anúncio; tokens não ficam em código |
| Eventos e filtros Z-API | **Preservar no adaptador Z-API; corrigir** | Vincular instância à conta, validar evento/retry e retirar destino/token literal |
| Edição, exclusão, reação e evento não suportado | **Adiar efeito de produto** | Adaptador audita e deduplica sem enviar ao cérebro; mutação visual/histórica exige contrato específico posterior |
| Contacto sem telefone | **Corrigir no mestre/schema** | `telefone` é opcional; identidade usa conta, canal e ID opaco do provedor, sem fabricar telefone a partir de sender ID |
| Origem de anúncio | **Preservar no adaptador; corrigir** | Persistir atribuição estruturada e IDs mínimos; não equiparar anúncio a `followup_rapido` nem depender de texto de boas-vindas |
| Lista de contactos bloqueados/filtros operacionais | **Preservar no adaptador; corrigir** | Configuração central por conta, auditável e sem números codificados no export |
| Cérebro e prompt principal | **Manter em workflow separado** | Somente `lexia.brain.request.v1`/`result.v1`; sem credencial de envio ou acesso ao estado global |
| Tools e Google Agenda | **Manter no cérebro** | Resultado real vira evento de domínio atestado; mestre não chama Google nem Supabase privado |
| Lembretes | **Manter em workflow separado** | Produzir `lexia.automation.request.v1` e passar por estado/gate comum; sem envio direto |
| Follow-ups, inclusive rápido | **Manter em workflow separado; corrigir** | Retirar espera longa e envio do tronco; agendar de forma idempotente e submeter cada ação ao gate comum |
| Handoff e notificação da equipe | **Dividir responsabilidades** | Mestre cria estado/handoff durável; notificação fica em automação separada e não altera pausa por conta própria |
| Contexto devolvido pelo cérebro | **Preservar somente parte operacional** | Aplicar patch allowlisted ao central; memória/tool state privados permanecem no cérebro |
| Texto, imagens e legendas de saída | **Preservar em Delivery; corrigir** | Plano ordenado por `sequence`, caption atômica quando possível e checkpoint por ação para entrega parcial |
| Indicador de digitação | **Preservar no adaptador como best effort** | Nunca conta como entrega, não altera estado e sua falha não repete a resposta |
| Modo de teste e bloqueio de envio real | **Preservar no mestre; fortalecer** | `delivery_mode` resolvido server-side; fixture/shadow não possui credencial e o gate recusa envio |

Os quatro nós acrescentados em relação ao export sanitizado de 144 nós são
`Intervenção é áudio?`, `Baixar Áudio da Intervenção`,
`Transcrever Áudio da Intervenção` e uma nota explicativa. No fluxo atual, a
trava é escrita antes do download, o que deve ser preservado. Download ou
transcrição sem saída de erro, porém, pode interromper a persistência da
mensagem; essa lacuna é tratada como correção obrigatória, não como simples
cópia do ramo.

Esta matriz não altera as regras das seções 6 e 7: composição independente de
bloqueios, retomada configurável, handoff com resolução e retomada separadas,
agendamento/cancelamento da Miranda e supressão de resposta preparada continuam
obrigatórios para qualquer capacidade preservada ou separada.

## 16. Inventário atual e compatibilidade pendente

### Material disponível

| Referência | Nós | Observação |
| --- | ---: | --- |
| `MIRANDA SKIN EXPERT - OMNICHANNEL atualizado` (local, não sanitizado) | 148 | referência funcional somente em leitura; não versionar/importar |
| `MIRANDA SKIN EXPERT - OMNICHANNEL` | 144 | WhatsApp, Meta, buffer, mídia, contexto, pausa, retomada, follow-up e chamada de cérebro |
| `LEXIA - DETAIL BY CORDEIRO - OMNICHANNEL` | 107 | estrutura comum semelhante, com adaptador/brain próprios |
| `Lexia - Analista (chat)` | 15 | fora do Lote 2 |
| `Lexia - Classificar Conversas` | 2 | fora do Lote 2 |

Os exports sanitizados estão inativos e indicam referências a credenciais de
Redis, Supabase, Postgres, modelos e provedores, além de destinos privados que
foram removidos. O fluxo atual usa chaves para buffer, contexto, eco,
intervenção, pausa manual, pausa pós-agendamento e retomada. Miranda e Detail
duplicam grande parte desse tronco, mas diferem em provedor, mídia, cérebro e
algumas regras.

O export atualizado estava marcado como ativo no arquivo e conserva valores
privados inline. Ele serviu apenas para confirmar a topologia de 148 nós, o
prompt de contexto específico da Miranda, a saída atual de contexto, autoria e
histórico, os ramos de mídia, filtros Meta/Z-API, anúncio e entrega ordenada.
Nenhum valor privado foi transferido para esta especificação.

Depois da aprovação específica de 09/10/2026, os seis exports privados em
`Miranda Workflows.zip` passaram a ser também entrada somente leitura do
gerador de candidatos. O gerador copia apenas nós de lógica selecionados,
remove credenciais, IDs de webhook e destinos, e reestrutura os efeitos em
workflows novos e inativos. O ZIP e os exports brutos continuam fora do Git;
nenhum valor de credencial ou destino é herdado.

O material não confirma o que está publicado agora no n8n. Antes de preservar
compatibilidade, precisamos obter do n8n, sem exportar valores secretos:

1. nomes, IDs lógicos, versões e estado ativo dos workflows publicados de
   Miranda e Detail;
2. quais webhooks/canais/contas alimentam cada fluxo e qual é o dono atual da
   entrega;
3. contratos reais de entrada e saída dos subworkflows de cérebro, com exemplos
   sanitizados;
4. semântica de retry, ordenação, assinatura e eco de cada provedor;
5. IDs de mensagem disponíveis para distinguir IA de intervenção humana;
6. inventário de chaves Redis, operações e TTLs por fluxo, sem valores;
7. follow-ups, schedules e caminhos de cancelamento que rodam fora do export
   principal;
8. contrato real da tool de agendamento da Miranda, incluindo confirmação,
   cancelamento, horários, timezone e lembretes;
9. error workflows, modo de execução, concorrência e política de retry do n8n;
10. nomes e tipos das credenciais necessárias, nunca seus valores;
11. confirmação de quais eventos persistem hoje em `lexia_contactos`,
    `lexia_mensagens` e `lexia_handoffs`;
12. prompts e schemas de contexto desejados para cada empresa, começando por
    uma versão sanitizada da Miranda e outra empresa para provar isolamento;
13. comportamento real de contactos Meta sem telefone e quais IDs permanecem
    estáveis por conta/canal;
14. tipos, limites, timeout e política de falha desejados para transcrição,
    imagem, PDF e vídeo;
15. contrato atual de texto/imagem/legenda de cada provedor e como consultar
    entrega ambígua por ID;
16. workflows publicados de lembrete e follow-up que hoje conseguem enviar ou
    alterar chaves de pausa fora do omnichannel;
17. decisão explícita sobre Asteric e seu escopo antes de incluí-la.

## 17. Arquivos previstos

### Referência funcional do fluxo atual

- `docs/LOTE_2_REFERENCIA_FLUXO_ATUAL_MIRANDA.md`: análise de leitura dos
  exports atuais da Miranda, separando evidência de hipótese, lacunas
  confirmadas e o plano de preservação do buffer.

### Criados nesta etapa de especificação

- `docs/LOTE_2_WORKFLOW_MESTRE_OMNICHANNEL.md`
- `Agent.MD`
- `PLAN.MD`

### Primeira implementação local concluída

- `contracts/omnichannel/v1/ingress-event.schema.json`
- `contracts/omnichannel/v1/state-command.schema.json`
- `contracts/omnichannel/v1/context-agent-config.schema.json`
- `contracts/omnichannel/v1/context-result.schema.json`
- `contracts/omnichannel/v1/domain-event.schema.json`
- `contracts/omnichannel/v1/brain-request.schema.json`
- `contracts/omnichannel/v1/brain-result.schema.json`
- `contracts/omnichannel/v1/automation-request.schema.json`
- `contracts/omnichannel/v1/outbound-action.schema.json`
- `contracts/omnichannel/v1/delivery-result.schema.json`
- `contracts/omnichannel/v1/crm-sync-event.schema.json`
- `contracts/omnichannel/v1/crm-command.schema.json`
- `contracts/omnichannel/v1/workflow-test-request.schema.json`
- `contracts/omnichannel/v1/workflow-test-result.schema.json`
- `contracts/omnichannel/v1/examples/*.json`
- `lib/omnichannel/contracts.ts`
- `lib/omnichannel/automation.ts`
- `lib/omnichannel/brain-boundary.ts`
- `lib/omnichannel/capabilities.ts`
- `lib/omnichannel/scope.ts`
- `lib/omnichannel/redis-keys.ts`
- `lib/omnichannel/schema-validator.ts`
- `lib/omnichannel/context-config.ts`
- `lib/omnichannel/operational-context.ts`
- `lib/omnichannel/history.ts`
- `lib/omnichannel/media.ts`
- `lib/omnichannel/state-machine.ts`
- `lib/omnichannel/idempotency.ts`
- `lib/omnichannel/delivery-plan.ts`
- `lib/omnichannel/inbound-buffer.ts`
- `lib/omnichannel/fake-adapters.ts`
- `lib/omnichannel/policy.ts`
- `lib/omnichannel/brain-result-apply.ts`
- `tests/omnichannel-contracts.test.ts`
- `tests/omnichannel-context-isolation.test.ts`
- `tests/omnichannel-history-isolation.test.ts`
- `tests/omnichannel-media-failure.test.ts`
- `tests/omnichannel-scope-isolation.test.ts`
- `tests/omnichannel-schema-validation.test.ts`
- `tests/omnichannel-state-machine.test.ts`
- `tests/omnichannel-delivery-gate.test.ts`
- `tests/omnichannel-reprocess.test.ts`
- `tests/omnichannel-appointment-policy.test.ts`
- `tests/fixtures/omnichannel/*.json`
- `package.json` (`test:lote2:local`)
- `n8n/omnichannel/README.md`
- `n8n/omnichannel/master-v1.inactive.json`
- `n8n/omnichannel/subworkflows/adapter-ingress-fake-v1.inactive.json`
- `n8n/omnichannel/subworkflows/resolve-scope-fake-v1.inactive.json`
- `n8n/omnichannel/subworkflows/ingest-fake-v1.inactive.json`
- `n8n/omnichannel/subworkflows/state-command-v1.inactive.json`
- `n8n/omnichannel/subworkflows/project-redis-fake-v1.inactive.json`
- `n8n/omnichannel/subworkflows/media-normalize-fake-v1.inactive.json`
- `n8n/omnichannel/subworkflows/buffer-context-v1.inactive.json`
- `n8n/omnichannel/subworkflows/context-config-fake-v1.inactive.json`
- `n8n/omnichannel/subworkflows/context-agent-v1.inactive.json`
- `n8n/omnichannel/subworkflows/invoke-brain-fake-v1.inactive.json`
- `n8n/omnichannel/subworkflows/apply-brain-result-v1.inactive.json`
- `n8n/omnichannel/subworkflows/handoff-policy-v1.inactive.json`
- `n8n/omnichannel/subworkflows/appointment-policy-v1.inactive.json`
- `n8n/omnichannel/subworkflows/delivery-gate-v1.inactive.json`
- `n8n/omnichannel/subworkflows/provider-send-fake-v1.inactive.json`
- `n8n/omnichannel/subworkflows/expiry-resume-v1.inactive.json`
- `n8n/omnichannel/subworkflows/recovery-v1.inactive.json`

### Candidatos Miranda v2 concluídos localmente

- `scripts/lib/miranda-v2-builder.ts`
- `scripts/build-miranda-v2-candidates.ts`
- `scripts/build-miranda-v2-lab-deployment.mjs`
- `scripts/lib/miranda-v2-lab-runtime.mjs`
- `n8n/miranda-v2-candidate/README.md`
- `n8n/miranda-v2-candidate/MANIFEST.json`
- `n8n/miranda-v2-candidate/SANITIZATION_REPORT.json`
- `n8n/miranda-v2-candidate/*.inactive.json` (6 workflows consolidados de 16 blocos)
- `tests/miranda-v2-candidate-workflows.test.ts`
- `n8n/miranda-v2-lab-runtime/*.inactive.json` (6 runtimes sintéticos compactos)
- `tests/miranda-v2-lab-runtime.test.ts`

O ZIP bruto é apenas entrada local do gerador e não faz parte destes arquivos.
Os candidatos preservam lógica privada necessária da Miranda, mas removem
credenciais e destinos. Portanto, continuam material restrito de integração e
não devem ser publicados como exemplos genéricos.

### Fase de banco e harness isolado executada (09/10/2026)

Resumo de revisão e resultados em `docs/LOTE_2_REVISAO_BANCO.md`. SQL foi
aplicado apenas no projeto descartável `gaofupndxgitonfmvpzi`.

- `supabase/checks/202610080001_lote2_preflight.sql`
- `supabase/migrations/202610080001_lote2_omnichannel_control_plane.sql`
- `supabase/migrations/202610090001_lote2_state_event_command_types.sql`
- `supabase/migrations/202610090002_lote2_crm_appointment_cancellation.sql`
- `supabase/checks/202610090003_lote2_crm_followup_preflight.sql`
- `supabase/checks/202610080002_lote2_verify.sql`
- `supabase/operations/202610080001_lote2_disable_delivery.sql`
- `supabase/operations/202610080002_lote2_seed_initial_policies.sql`
- `supabase/rollbacks/202610080001_lote2_omnichannel_control_plane_down.sql`
- `tests/lote2-db-contract.test.ts` (contrato estático, sem banco)
- `supabase/isolated/lote2/bootstrap_preflight.sql`
- `supabase/isolated/lote2/000000000000_lote2_test_baseline.sql`
- `supabase/isolated/lote2/000000000001_lote2_test_fixtures.sql`
- `supabase/isolated/lote2/000000000002_lote2_test_verify.sql`
- `supabase/isolated/lote2/000000000003_lote2_test_cleanup.sql`
- `supabase/isolated/lote2/000000000004_lote2_runtime_cleanup.sql`
- `supabase/isolated/lote2/README.md`
- `supabase/isolated/lote2/manifest.json`
- `scripts/lib/lote2-isolated-target.mjs`
- `scripts/check-lote2-db-connectivity.mjs`
- `scripts/check-lote2-redis-connectivity.mjs`
- `scripts/preflight-lote2-isolated.mjs`
- `scripts/apply-lote2-isolated.mjs`
- `scripts/apply-lote2-isolated-followup.mjs`
- `scripts/test-lote2-runtime-isolated.ts`
- `scripts/test-lote2-frappe-isolated.ts`
- `scripts/import-lote2-frappe-lab-credentials.mjs`
- `tests/lote2-isolated-harness.test.ts`

Conectividade, identidade, vazio inicial, SQL, fixtures, verificação e nove
cenários Supabase + Redis passaram. O runner usou duas empresas sintéticas,
provider `fake`, `observe_only` e nenhuma URL externa; removeu as conversas e
chaves runtime e preservou as configurações de teste.

O ensaio adicional com `lexia_crm 0.4.1` usou o Frappe local em
`outbox_only`, identidades técnicas distintas e a mesma conta sintética. Sete
cenários passaram entre Frappe e Supabase: timeline idempotente, pausa manual,
handoff separado, cancelamento, no-show e resultado incerto sem retry, além dos
gates de identidade. A limpeza removeu os recursos runtime do manifesto e o
Redis permaneceu com zero chaves.

### Fase de plataforma, depois do harness isolado

- `lib/omnichannel/server/config.ts`
- `lib/omnichannel/server/state-commands.ts`
- `lib/omnichannel/server/read-model.ts`
- `app/actions/omnichannel-state.ts`
- componentes de bloqueio/handoff existentes, adaptados sem remover o legado
- testes de Server Actions e runtime em harness descartável

Os nomes de migration podem mudar se outro lote ocupar o mesmo timestamp antes
da implementação; a ordem lógica e o conteúdo não podem mudar sem atualizar
este documento.

## 18. Ordem de construção

1. **Contrato e máquina de estado locais:** JSON Schemas, tipos, key builder,
   seleção de configuração de contexto, normalização de mídia, plano de
   entrega, transições puras e testes com duas empresas sintéticas.
2. **Mestre inativo:** exports versionados sem credenciais, com adaptador e
   cérebro falsos, agente de contexto compartilhado por contrato e todos os
   caminhos de saída bloqueados.
3. **Revisão de segurança e contrato:** validar falha fechada, limites, PII,
   eventos de tool e impossibilidade de envio pelo cérebro/shadow.
4. **Schema aditivo em arquivos:** migration, preflight, verificação, RLS, RPCs
   e recuperação; sem aplicar.
5. **Harness isolado:** Supabase e Redis exclusivos de teste, identidade remota,
   manifesto e duas empresas sintéticas.
6. **Integração do mestre no harness:** projeção, corridas, expiração,
   idempotência e receptor falso.
7. **Plataforma atrás de feature flag:** configuração e comandos v2, mantendo
   leitura/rollback v1.
8. **Inventário n8n real:** preencher as lacunas de compatibilidade sem copiar
   credenciais ou destinos.
9. **Shadow sem saída:** comparar eventos e decisões, com v1 como único dono da
   entrega.
10. **Conectar um cérebro e escolher piloto:** decisão posterior, com aprovação
    própria e critérios de corte.

## 19. Escopo exato da primeira implementação local

A primeira implementação aprovada foi concluída dentro destes limites:

- criar os contratos v1 listados acima e exemplos inteiramente
  sintéticos;
- implementar funções puras de escopo, chave Redis, resolução exata da
  configuração de contexto, saída operacional, autoria/histórico,
  normalização de mídia, idempotência, composição de bloqueios, retomada,
  plano ordenado de entrega e gate de versão;
- usar duas configurações de prompt/schema sintéticas e uma empresa sem
  configuração para provar isolamento e falha fechada;
- provar que históricos com IDs externos iguais não cruzam tenant/conta;
- provar que falha de transcrição preserva evento e pausa humana;
- provar deduplicação, entrega parcial e intervenção entre preparação e
  entrega;
- montar o mestre e os subworkflows como exports **inativos**, usando somente
  Manual Trigger/eventos de fixture, configuração de contexto falsa, cérebro
  falso, automação falsa e adaptador falso;
- representar cérebro, tools, lembretes e follow-ups apenas pelas fronteiras de
  contrato; não copiar seus workflows para dentro do mestre;
- garantir por construção que os exports não tenham credenciais nem nós com
  destino externo real;
- documentar entradas, saídas e pontos onde banco/Redis serão ligados depois;
- atualizar CI para executar apenas os testes locais desse contrato.

Essa primeira implementação não incluirá:

- migration SQL ou alteração de banco;
- conexão a Redis, Supabase, n8n publicado, canais ou cérebro real;
- modelo/transcritor real, download de mídia ou armazenamento externo;
- implementação interna de cérebro, tool, lembrete ou follow-up;
- importação/ativação de workflow;
- mudança no comportamento da plataforma;
- uso dos exports sanitizados como base importável;
- Asteric, piloto, credenciais, push, merge ou deploy.

## 20. Estado verificável da implementação local

Funciona localmente, sem serviço externo:

- resolução simulada e exata de configuração de contexto por ambiente/tenant;
- Set genérico por item e rejeição de prompt, memória, mensagem ou histórico de
  outro escopo;
- resultado de contexto vinculado ao escopo completo, chamada, versão da
  configuração e lista ordenada das mensagens de origem; troca entre chamadas,
  conversas ou empresas falha mesmo quando a `config_version` coincide;
- contratos provisórios de ingresso, estado, contexto, cérebro, evento de tool,
  automação, ação e entrega, validados em profundidade pelos próprios JSON
  Schemas; palavra-chave ou referência recursiva não suportada falha na
  validação inicial da definição e não pode ser absorvida por `not`, `anyOf` ou
  `oneOf`;
- `date-time` validado por componentes de calendário, relógio e fuso, sem
  normalização silenciosa de data impossível ou aceitação de hora `24`;
- bloqueios independentes e idempotentes para intervenção humana, pausa manual,
  handoff e agendamento;
- intervenção humana atrasada não encurta o prazo estabelecido por mensagem
  mais recente;
- cancelamento de agendamento preservando bloqueio ainda vigente, negando
  lembrete e sem recriar bloco já removido ou expirado;
- autoria, histórico e mídia provados no harness falso; adaptadores Meta/Z-API
  candidatos normalizam payloads reais apenas localmente, sem chamar serviço;
- plano ordenado que revalida estado antes de cada ação, preserva entrega
  parcial também diante de exceções e exige reconciliação de qualquer envio de
  resultado incerto;
- resposta do cérebro vinculada ao snapshot da solicitação e evento de
  agendamento vinculado à operação, invocação e referência devolvida pela tool;
- chaves locais de idempotência codificadas como tupla JSON, sem colisão quando
  identificadores contêm separadores;
- harness genérico com mestre e 17 subworkflows inativos, sem credencial, URL
  ou nó de rede;
- contrato provisório `lexia.crm.event.v1`, mapa dos seis workflows da Miranda
  e sink Frappe em `shadow_only`; fatos de provedor, tool, workflow, cérebro e
  usuário do CRM possuem autoridades distintas e o par autoridade/sistema é
  validado;
- mensagem e bloqueios usam identidade derivada do escopo completo, mídia pode
  ser enriquecida depois sem perder o evento original e resultado de entrega
  incerto conserva `action_id` para reconciliação.

Ainda não foi verificado e depende de etapa posterior aprovada:

- compatibilidade dos schemas com os workflows realmente publicados;
- RLS com usuários Auth sintéticos e leitura pela futura plataforma v2;
- corridas realmente simultâneas, leases/TTLs e recuperação após queda de
  processo; a persistência sequencial e a reprojeção Redis já passaram;
- importação e compatibilidade de versão no n8n;
- payloads, assinaturas, ecos, limites e confirmações reais dos provedores;
- modelos, download/transcrição/análise de mídia, cérebros e tools reais;
- proveniência real dos eventos de tool: localmente há validação de capacidade,
  invocação, operação, estado capturado e referência correlacionada, mas somente
  o workflow real poderá autenticar o resultado e provar que o envelope foi
  criado a partir da execução da tool, fora do texto livre do modelo;
- workflows reais de lembrete/follow-up e runtime da plataforma.

O receptor aditivo foi instalado apenas no laboratório Frappe
`crm-hml.localhost`, com identidade
`isolated_test`/`empresa_sintetica_a`. A versão `0.4.1`, 36 testes Frappe,
saúde dos serviços e ausência de resíduos runtime foram confirmadas em
09/10/2026. O laboratório possui usuários técnicos distintos para operação e
integração, com chaves fora do Git, mas nenhum sink foi ligado ao n8n. O
resultado não comprova ainda compatibilidade dos payloads reais.

Em 10/10/2026, o laboratório evoluiu para `lexia_crm 0.6.3` e ganhou
`/crm/agent-test`. A rota persiste conversa e mensagem sintéticas antes da
fila e acompanha a resposta do worker. O modo habilitado é `remote`, restrito
ao laboratório, e chama somente um gateway sintético autenticado no n8n. A
resposta é correlacionada e marcada como suprimida; gateway e filhos não
possuem Supabase, Redis, cérebro, modelo, tool, canal ou provedor.
`/crm/agent-test` agora mantém uma inbox própria com múltiplas conversas por
usuário; sintéticos são omitidos da inbox operacional e seu detalhe é negado
diretamente. Foram aprovados 56/56 testes Frappe, 246/246 testes do frontend
upstream, lint, build, inspeção visual e smoke autenticado. MariaDB e Redis
internos não foram recriados. Isso valida a experiência e o ciclo local, não o
workflow real.

A versão 0.6.3 ampliou somente a allowlist de limpeza para o manifesto da tela
de teste (`test:SYNTH-LEXIA-TEST-CHAT-`), preservando as verificações de site
isolado, empresa, conta, canal e flag sintética. A limpeza posterior removeu
seis conversas Frappe do ensaio e deixou zero alvos desse manifesto.

O gateway foi publicado como workflow dedicado com Webhook, validação, roteio
e resposta. Seis runtimes compactos foram publicados em IDs próprios para os
papéis Entrada, Atendimento, Agenda, Automações, CRM e Saída. Requisição sem
autenticação ou com segredo incorreto foi recusada com HTTP 403; contrato
sintético válido concluiu pela UI com `provider_send_attempted = false`;
tentativas de `delivery_mode = deliver` ou de exigir envio falharam fechadas.
Os seis alvos foram exercitados e cada um retornou o traço esperado dos
subworkflows chamados. Em seguida, o gateway foi migrado para os seis
workflows HML completos, que receberam rotas de laboratório fechadas para os
mesmos contratos. Os seis cenários publicados passaram com
`provider_send_attempted = false`; ambiente diferente de `isolated_test` foi
rejeitado antes do roteamento. As seis cópias compactas remotas foram
despublicadas e arquivadas, permanecendo no Git apenas como fixtures.

O primeiro ensaio do corredor revelou incompatibilidades e falhou fechado
antes de qualquer efeito: a conversa persistente do Agent Test não usa o
`run_id` como identidade, e o sandbox desta instalação não expõe
`structuredClone`. O contrato passou a aceitar somente `test:<run_id>` ou
`test:SYNTH-LEXIA-TEST-CHAT-<UUID>`, mantendo `message_id` vinculado ao run, e
os nós sintéticos passaram a copiar apenas JSON já validado. Testes de
regressão cobrem os formatos aceitos e rejeitados e proíbem `structuredClone`
no caminho executável. Na primeira chamada com os seis filhos, o gateway
também recebeu o envelope Webhook completo; agora extrai `.body` antes da
validação, com teste de regressão próprio.

O deployment é reproduzido por
`scripts/build-miranda-v2-lab-deployment.mjs`. A instância não permitiu ativar
um pai referenciando filhos não publicados. Em vez de contornar essa proteção,
o builder gera seis filhos sintéticos sanitizados, que são conferidos e
publicados antes do gateway. Os artefatos de implantação e o segredo continuam
fora do Git.

A CLI da instancia alertou que PostgreSQL 15 nao e suportado e recomenda 17
(16 apenas em compatibilidade). Depois da ativacao, o relay de telemetria
tambem reportou `license provider` ausente, embora a importacao tenha concluido
e o export posterior tenha confirmado a versao ativa correta. Ambos sao
pendencias de infraestrutura antes de qualquer classificacao como producao.

Também foi preparado um gerador local de pacote de revisão. Ele lê os seis
exports fornecidos sem alterá-los, remove credenciais e destinos, desativa todos
os nós herdados e acrescenta a cada cópia um ramo isolado de simulação
autenticada. Esse ramo comprova somente correlação Frappe-n8n e bloqueio de
envio; não executa banco, Redis, modelo, tool ou provedor. As cópias continuam
inativas e não constituem o mestre integrado definitivo.

Em 09/10/2026 foi criada uma camada separada de candidatos funcionais em
`n8n/miranda-v2-candidate/`, gerada por
`scripts/build-miranda-v2-candidates.ts`. Ela não é a cópia de revisão: os 16
blocos reestruturados foram consolidados em seis workflows, todos
`active: false`: entrada omnichannel, atendimento IA, agenda,
follow-ups/lembretes, integração CRM e saída segura. Em conjunto eles cobrem
adaptadores, ingresso durável, mídia, contexto, cérebro, tools, eventos de
domínio, delivery gate, CRM sync, único provider send, automações e comandos
do CRM.

Garantias provadas localmente nesses candidatos:

- cada evento é deduplicado e persistido como mensagem individual antes de
  pausa, buffer, mídia ou IA;
- intervenção humana registra/renova seu bloqueio antes de transcrição e não
  alcança o cérebro;
- Lead/Deal, conversa, timeline, mídia, bloqueios, agendamentos, automações,
  handoffs, entrega e atribuição são emitidos ao Frappe em eventos ordenados;
- lote Meta percorre todos os `entry.messaging`, preservando campanha,
  conjunto, anúncio e `fbclid` quando fornecidos;
- prompt, histórico e saída do agente de contexto exigem cardinalidade única e
  escopo exato; configuração ausente ou duplicada falha fechado;
- tool de disponibilidade nunca confirma agendamento; a criação só emite
  `appointment.confirmed` depois do Calendar e da linha privada;
- follow-up e lembrete continuam separados, mas entram no mesmo ledger e
  delivery gate; imagem/legenda e áudio usam referências opacas;
- cada ação é reivindicada novamente antes do provedor; falha parcial preserva
  progresso e resultado ambíguo vira `delivery_unknown` sem retry automático;
- pausa, resolução/retomada de handoff, cancelamento e presença/no-show entram
  por `lexia.crm.command.v1`, com payload fechado e conta/tenant revalidados.

As garantias locais continuam sendo a especificação executável. Em 10/10/2026,
os seis candidatos foram hidratados para HML, publicados na pasta
`CRM MIRANDA SKIN` e ligados pelos IDs locais. O pacote local atual totaliza
312 nodes; as seis cópias HML preservam esses 312 nodes e recebem somente
credenciais, referências e configuração exclusivas do laboratório. O gateway
sintético é um sétimo workflow separado. Webhooks
de canal e schedules ficaram desligados, destinos de provider foram substituídos
por `.invalid` e o modo de entrega permaneceu `observe_only`. Uma execução
sintética direta da Entrada percorreu a espera real do buffer, contexto,
cérebro, espelho CRM e gate, terminando como `suppressed/observe_only` com
`provider_send_attempted = false`; os nodes de envio Z-API, Meta e adaptador
externo não executaram. Os seis workflows originais da Miranda foram conferidos
depois e mantiveram seus IDs, versões e datas anteriores.

Isso comprova o corredor HML com os nodes reais configurados para teste, mas
não payloads ou efeitos de canais reais. A tela Agent Test agora chama o
gateway ligado aos seis workflows HML completos. `safe_simulation` continua
sem banco, Redis, modelo, Calendar ou provider; `full_agent_virtual` usa o
Supabase/Redis descartáveis e o cérebro HML, mas mantém Calendar desabilitado e
suprime todas as ações antes do provider. A validação de payloads e efeitos de
canais reais continua sendo uma etapa posterior.

Duas rodadas com pares de mensagens rápidas foram executadas na mesma conversa
sintética. Em ambas, a resposta preparada pelo lote antigo foi descartada, a
Entrada aguardou e reivindicou a sequência mais recente e o novo lote reuniu
as duas mensagens com o histórico já persistido. A resposta final permaneceu
em espanhol, não reapresentou Carol, não repetiu a pergunta anterior e não
tentou provider. Depois de tratar `superseded_by_new_message` como conclusão
esperada do lote antigo, as duas Entradas concorrentes (`133402` e `133404`)
terminaram com sucesso.

Resultados consolidados em 10/10/2026:

- `npm run test:lote2:local`: 193/193 testes aprovados;
- candidatos, reprocessamento e deployment HML focados: 47/47 testes aprovados;
- `npm run test:lote2:runtime:isolated`: 9/9 cenários integrados aprovados;
- `npm run test:lote2:frappe:isolated`: sete cenários Frappe + Supabase e
  limpeza aprovados;
- limpeza runtime: Frappe, Supabase e Redis com zero registros/chaves do
  manifesto depois da remoção exata dos dados sintéticos;
- app Frappe `lexia_crm 0.6.4`: 58/58 testes aprovados no laboratório,
  246/246 testes do frontend upstream e smoke automático da fila aprovados;
- gateway sintético Frappe-n8n: autenticação, correlação, conversa persistente,
  seis alvos por subworkflows e ausência de envio externo aprovados;
- cérebro HML no Agent Test: a mesma conversa mudou de português para inglês e
  depois espanhol; o gate aprovou os três turnos e nenhum tentou envio ao
  provider;
- mestre executável de teste: `n8n/omnichannel-test/` (ver README), ainda não
  importado como conjunto de workflows;
- `npm run lint`: aprovado sem erros;
- `npm run typecheck`: aprovado sem erros;
- `npm run build`: aprovado com Next.js 16.2.9 e 29 rotas geradas;
- validação sintática de todos os JSON de contratos, exemplos e exports: aprovada.

## 21. Gates de aprovação posteriores

Cada avanço exige aprovação nova e evidência do anterior:

1. **Concluído localmente:** aprovação desta especificação para criar contratos
   e workflows inativos;
2. **Concluído em arquivos:** revisão do diff e dos testes locais para preparar SQL;
3. **Concluído no descartável:** aprovação do schema e do rollback antes do banco isolado;
4. **Concluído no descartável:** confirmação explícita dos destinos antes da primeira escrita;
5. aprovação da integração da plataforma atrás de flag;
6. inventário confirmado do n8n antes de shadow;
7. escolha explícita do piloto antes de conectar cérebro/canal;
8. backup com restauração verificada, staging e aprovação final antes de
   qualquer produção.

Até esses gates serem cumpridos, produção, Redis reais, workflows atuais,
Supabases privados, Google Agenda, push, merge e deploy permanecem intocados.
