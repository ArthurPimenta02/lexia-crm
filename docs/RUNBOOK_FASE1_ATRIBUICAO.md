# Runbook — Fase 1: captura de atribuicao de origem

Executa a Fase 1 de `PLANO_ENTREGA_CRM_MULTICLIENTE.md` nos dois clientes
activos (Miranda Skin Experts e Detail by Cordeiro) sem interromper os agentes.

**Porque e urgente:** o bloco de anuncio chega apenas na **primeira mensagem**
do lead. Nao e recuperavel depois. Sem ele nao ha CAC.

**A boa noticia:** os dois workflows **ja extraem** esse bloco. Nao e preciso
escrever logica de parsing nova — apenas persistir o que ja esta em memoria.

| | Miranda | Detail |
|---|---|---|
| No que extrai | `Adaptar Entrada Z-API` | `Normalizar Entrada Meta Omnichannel` |
| Canal | WhatsApp (Z-API) | Instagram / Messenger (Meta) |
| Campo | `body._anuncio` | `body._anuncio` |
| Formato | `{source_id, titulo, corpo, source_url, source_app}` | `{id, titulo, ref}` |
| Hoje serve para | escolher o audio do follow-up de 1h | contexto do Cerebro |
| Persistido | **nao** | **nao** |

Os formatos diferem, por isso a expressao abaixo aceita os dois e normaliza.
E **a mesma expressao nos dois clientes** — nao personalizar por cliente.

---

## Passo 1 — Migration (fazer primeiro, sempre)

Correr `supabase/migrations/202610130001_lote3_atribuicao_origem.sql` no
Supabase **central** da Lexia (`Lexia AI - Live`), no SQL Editor.

**Nao** correr nos Supabases dos clientes. A migration tem um guard que falha
com mensagem explicita se for executada na base errada.

Risco: **nenhum**. `ADD COLUMN` sem `DEFAULT` nao reescreve a tabela em
Postgres 11+, portanto e instantaneo mesmo com a tabela em uso. Todas as
colunas sao nullable, logo nenhuma escrita actual do n8n passa a falhar.

Depois, correr `supabase/checks/202610130001_lote3_atribuicao_verify.sql`.
E so-leitura. Deve terminar sem excepcao e mostrar `com_anuncio = 0` em todos
os clientes — normal, ainda ninguem escreve.

**A migration tem de vir antes do n8n.** Se o workflow tentar escrever numa
coluna que ainda nao existe, o Supabase devolve erro e a criacao do contacto
falha.

---

## Passo 2 — Novo campo no `Normalizar Dados Operacionais`

No no **`Normalizar Dados Operacionais`** (tipo Set), acrescentar **uma**
assignment no fim. Nao alterar nenhuma das existentes.

- **Nome:** `origem_captura`
- **Tipo:** `Object`
- **Valor:**

```javascript
={{ (() => {
  const vazio = { tipo: 'organico', source_id: '', titulo: '', url: '', dados: null };
  const ler = (fn) => { try { return fn(); } catch (e) { return null; } };

  try {
    const body = $("Entrada Unificada").first().json.body || {};
    const a = body._anuncio;
    if (!a || typeof a !== 'object') return vazio;

    // Aceita as duas formas: {source_id,titulo,...} da Z-API e {id,titulo,ref} da Meta.
    const sid = String(a.source_id || a.id || a.ref || '');
    const tit = String(a.titulo || a.title || '');
    if (!sid && !tit) return vazio;

    // Mesma cadeia de resolucao de canal ja usada pela assignment "canal".
    const canal = String(
      body._canal || body.lexia_workflow_tipo || body.lexia_canal || body.source ||
      ler(() => $("Config Cliente Lexia").first().json.canal_padrao) || 'whatsapp'
    ).toLowerCase();

    const tipo = canal === 'instagram' ? 'instagram_ad'
               : canal === 'messenger' ? 'messenger_ad'
               : canal === 'whatsapp'  ? 'ctwa'
               : 'meta_ad';

    return {
      tipo,
      source_id: sid,
      titulo: tit,
      url: String(a.source_url || a.sourceUrl || ''),
      dados: a
    };
  } catch (e) { return vazio; }
})() }}
```

**Porque le tudo de `Entrada Unificada` e de mais lado nenhum.** `Entrada
Unificada` e um no `NoOp` que serve de ponto de juncao dos dois canais: nos
dois clientes o caminho Meta e o caminho WhatsApp passam ambos por ele antes de
chegar ao `Normalizar Dados Operacionais`. Logo ele corre **sempre**, e o
`body` que entrega ja traz o `_anuncio` venha ele de onde vier. Nao e preciso
referenciar `Normalizar Entrada Meta Omnichannel` — e referencia-lo seria um
risco desnecessario, porque esse no nao corre no caminho WhatsApp e `$("...")`
levanta erro em n8n quando o no nao correu.

**Porque o tipo sai do canal e nao do `source_app`.** E tentador ler
`source_app: 'instagram'` como "veio do Instagram", mas num `externalAdReply`
da Z-API esse campo diz apenas **onde o anuncio foi mostrado**; a conversa
continua a ser WhatsApp. Classificar isso como `instagram_ad` misturaria
click-to-WhatsApp com Instagram Direct e estragaria a leitura de CAC por canal.
O canal da conversa e a resposta certa para "como o lead chegou", e o
`source_app` nao se perde — fica inteiro dentro de `origem_dados`.

Este no **nao consegue falhar**: qualquer erro devolve `vazio`.

---

## Passo 3 — Gravar no `Criar Contacto`

No no **`Criar Contacto`** (Supabase insert, credencial `LEXIA CRM`),
acrescentar 6 campos. Nao mexer nos existentes.

| Campo | Valor |
|---|---|
| `origem_tipo` | `={{ $("Normalizar Dados Operacionais").first().json.origem_captura.tipo }}` |
| `origem_source_id` | `={{ $("Normalizar Dados Operacionais").first().json.origem_captura.source_id \|\| null }}` |
| `origem_titulo` | `={{ $("Normalizar Dados Operacionais").first().json.origem_captura.titulo \|\| null }}` |
| `origem_url` | `={{ $("Normalizar Dados Operacionais").first().json.origem_captura.url \|\| null }}` |
| `origem_dados` | `={{ $("Normalizar Dados Operacionais").first().json.origem_captura.dados }}` |
| `origem_capturada_em` | `={{ $("Normalizar Dados Operacionais").first().json.origem_captura.source_id ? $now : null }}` |

---

## Passo 4 — Preservar no `Actualizar Contacto`

Este e o passo que e facil errar.

`Actualizar Contacto` corre em **todas** as mensagens seguintes, e nessas o
bloco de anuncio **nao vem**. Se gravar o valor novo sem proteccao, a segunda
mensagem do lead apaga a atribuicao que a primeira capturou.

Regra adoptada: **first-touch** — a primeira atribuicao ganha e nunca e
sobrescrita. E a leitura correcta para CAC ("que anuncio trouxe este lead"),
e nao "qual foi o ultimo que ele viu".

| Campo | Valor |
|---|---|
| `origem_source_id` | `={{ $("Buscar Contacto").first().json.origem_source_id \|\| $("Normalizar Dados Operacionais").first().json.origem_captura.source_id \|\| null }}` |
| `origem_titulo` | `={{ $("Buscar Contacto").first().json.origem_source_id ? $("Buscar Contacto").first().json.origem_titulo : ($("Normalizar Dados Operacionais").first().json.origem_captura.titulo \|\| null) }}` |
| `origem_url` | `={{ $("Buscar Contacto").first().json.origem_source_id ? $("Buscar Contacto").first().json.origem_url : ($("Normalizar Dados Operacionais").first().json.origem_captura.url \|\| null) }}` |
| `origem_dados` | `={{ $("Buscar Contacto").first().json.origem_source_id ? $("Buscar Contacto").first().json.origem_dados : $("Normalizar Dados Operacionais").first().json.origem_captura.dados }}` |
| `origem_capturada_em` | `={{ $("Buscar Contacto").first().json.origem_source_id ? $("Buscar Contacto").first().json.origem_capturada_em : ($("Normalizar Dados Operacionais").first().json.origem_captura.source_id ? $now : null) }}` |

E `origem_tipo`, que permite subir de `organico` para `ctwa` se um contacto ja
conhecido voltar por um anuncio:

```javascript
={{ (() => {
  const ex = $("Buscar Contacto").first().json;
  const nv = $("Normalizar Dados Operacionais").first().json.origem_captura;
  if (ex.origem_source_id) return ex.origem_tipo;
  return nv.source_id ? nv.tipo : (ex.origem_tipo || nv.tipo);
})() }}
```

---

## Passo 5 — Testar antes de activar

**Nunca** testar enviando mensagem real para o numero de producao.

1. No n8n, abrir o workflow e correr **Execute Workflow** (sem trigger).
2. No no do webhook, usar **pin data** com um payload capturado de uma execucao
   real anterior que tenha `externalAdReply` (procurar no historico de
   execucoes uma conversa vinda de anuncio).
3. Confirmar no `Normalizar Dados Operacionais` que `origem_captura` saiu
   preenchido.
4. Repetir com um payload **sem** `externalAdReply` e confirmar que sai
   `tipo: 'organico'` e `source_id: ''` — sem erro.
5. So entao activar.

Depois de activar, correr a consulta 4 do ficheiro de verify e confirmar que
`com_anuncio` comeca a subir.

**Este ultimo passo nao e opcional, e a razao importa.** Os nos `Criar
Contacto` e `Actualizar Contacto` estao configurados com
`onError: continueRegularOutput` nos dois clientes. Isso e bom para o risco:
mesmo que um campo novo esteja errado, o Supabase recusa a escrita e **o
workflow segue na mesma** — o agente continua a responder ao lead, nada parte
para o cliente final. Mas tem o reverso: a falha e **silenciosa**. Nao aparece
execucao a vermelho no n8n. Se nao for verificado por SQL, a unica forma de
descobrir seria dar pela falta dos dados semanas depois, ja sem os recuperar.

Logo: confirmar que `com_anuncio` sobe e o que distingue "esta a funcionar" de
"esta a falhar em silencio". Se ficar em zero depois de passarem leads de
anuncio, abrir uma execucao recente e ler o output do no `Criar Contacto`.

---

## Ordem e janelas

1. Migration no Supabase central.
2. **Detail by Cordeiro primeiro.** O CRM ainda nao esta em uso neste cliente,
   logo um erro custa menos.
3. Observar **24 horas**.
4. **Miranda depois.**

Uma regra do plano que se aplica aqui: **nunca dois clientes na mesma janela**.
Se algo partir depois de mexer nos dois, nao ha como saber qual foi.

---

## Rollback

| Se partir | Accao |
|---|---|
| Contactos deixam de ser gravados (`com_anuncio` fica a zero e param de entrar contactos novos) | Remover os 6 campos de `Criar Contacto` e `Actualizar Contacto`. O workflow volta ao estado anterior. |
| `origem_captura` com erro | Desactivar/remover a assignment. Os outros campos do Set nao dependem dela. |
| Duvida geral | As colunas podem ficar na base. Sendo nullable e sem default, nao afectam nada. **Nao e preciso rollback de SQL.** |

Nenhum destes cenarios afecta o lead: o `onError: continueRegularOutput` dos
nos de contacto isola a escrita no CRM do atendimento. O pior caso e perder
atribuicao, nunca deixar um lead sem resposta.

---

## Fora do ambito, de proposito

- **Nao emite evento `attribution.capture`.** Isso exige estender o enum
  `command_type` de `lexia_conversation_state_events`, que e a Fase 2.
  Aqui so se grava o estado no contacto.
- **Nao ha `ctwa_clid`.** O `externalAdReply` da Z-API nao o expoe; so da
  `sourceId`. Para CAC por campanha o `sourceId` chega, porque e o ID do
  anuncio no Meta. O `ctwa_clid` so apareceria migrando para a Cloud API da
  Meta directamente — decisao separada, nao bloqueia nada.
- **Nao ha ecra no CRM.** A leitura e por SQL ate a Fase 8.
