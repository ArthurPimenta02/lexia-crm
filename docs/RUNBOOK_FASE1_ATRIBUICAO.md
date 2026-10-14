# Runbook — Fase 1: captura de atribuicao de origem

Executa a Fase 1 de `PLANO_ENTREGA_CRM_MULTICLIENTE.md` nos dois clientes
activos (Miranda Skin Experts e Detail by Cordeiro) sem interromper os agentes.

**Porque e urgente:** o bloco de anuncio chega apenas na **primeira mensagem**
do lead. Nao e recuperavel depois. Sem ele nao ha CAC.

**Na Miranda nao e preciso parsing novo**: o workflow ja extrai o bloco nos dois
canais, so nunca o grava. **No Detail e preciso** — e isso nao estava no
diagnostico inicial deste documento. Ver "O caso do Detail".

| | Miranda | Detail |
|---|---|---|
| Quem preenche `body._anuncio` | `Adaptar Entrada Z-API` (de `externalAdReply`) e `Normalizar Entrada Meta Omnichannel` (de `referral`) | **ninguem** |
| Provedor WhatsApp | Z-API: `sourceId` / `sourceUrl` | uazapi: **`sourceID`** / **`sourceURL`** |
| De onde a expressao le, no WhatsApp | `body._anuncio` (ja normalizado) | `body.message.content.contextInfo.externalAdReply` (cru — o webhook chega intacto ao `Entrada Unificada`) |
| Caminho Meta | `referral` ja lido → nada a fazer | normalizador **reconstroi o body** e perde o `referral` → exige o **Passo 2A** |
| Persistido antes da Fase 1 | **nao** | **nao** |

Os formatos diferem entre canais, por isso a expressao abaixo aceita os dois e
normaliza. E **a mesma expressao nos dois clientes** — nao personalizar por
cliente. O que difere entre clientes nao e a expressao: e o Passo 2A, que so o
Detail precisa.

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

    // Duas fontes possiveis, por esta ordem:
    // 1. body._anuncio -- ja normalizado por codigo do proprio workflow (Miranda).
    // 2. externalAdReply cru do uazapi (Detail no WhatsApp: ninguem normaliza antes).
    const cru = body._anuncio
      || ler(() => body.message.content.contextInfo.externalAdReply)
      || null;
    if (!cru || typeof cru !== 'object') return vazio;

    // Z-API diz sourceId/sourceUrl; uazapi diz sourceID/sourceURL; Meta diz id/ref.
    const sid = String(cru.source_id || cru.sourceID || cru.sourceId || cru.id || cru.ref || '');
    const tit = String(cru.titulo || cru.title || '');
    if (!sid && !tit) return vazio;

    const canal = String(
      body._canal || body.lexia_workflow_tipo || body.lexia_canal || body.source ||
      ler(() => $("Config Cliente Lexia").first().json.canal_padrao) || 'whatsapp'
    ).toLowerCase();

    const tipo = canal === 'instagram' ? 'instagram_ad'
               : canal === 'messenger' ? 'messenger_ad'
               : canal === 'whatsapp'  ? 'ctwa'
               : 'meta_ad';

    // O bloco em bruto traz ~4KB de thumbnails em base64. Guardar isso por
    // contacto enche a base sem acrescentar nada que se possa consultar.
    const lixo = ['thumbnail', 'jpegThumbnail', 'JPEGThumbnail', 'thumbnailURL', 'originalImageURL'];
    const dados = {};
    for (const k of Object.keys(cru)) {
      if (lixo.indexOf(k) !== -1) continue;
      const v = cru[k];
      if (typeof v === 'string' && v.length > 300) continue;
      dados[k] = v;
    }

    return {
      tipo,
      source_id: sid,
      titulo: tit,
      url: String(cru.source_url || cru.sourceURL || cru.sourceUrl || ''),
      dados
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

## O caso do Detail, e o que um payload real corrigiu

O diagnostico inicial deste documento afirmava que os dois clientes ja extraiam
o bloco de anuncio. **Era falso para o Detail.** Nada no workflow do Detail
produz `body._anuncio`: o normalizador Meta nao le `referral` (zero ocorrencias
no codigo) e o caminho WhatsApp nao tinha adaptador nenhum — a uazapi entrega o
webhook cru directamente ao `Entrada Unificada`.

**Como o erro passou:** o diagnostico leu `Preparar Payload Cerebro Detail`, que
referencia `$('Normalizar Entrada Meta Omnichannel').first().json.body._anuncio`,
e concluiu que havia extraccao a montante. Mas **ler um campo nao prova que
alguem o escreve** — sobretudo dentro de um `try/catch` que devolve `null` sem
se queixar. Esses dois nos do Detail sao, na pratica, codigo morto. Confirmar
sempre o *produtor* de um campo, nunca o consumidor.

O que resolveu foi ler um webhook real. Dele saiu o que nenhuma inferencia
daria:

- O `externalAdReply` da uazapi vive em
  `body.message.content.contextInfo.externalAdReply`.
- Os campos chamam-se **`sourceID`** e **`sourceURL`** — maiusculas diferentes
  das da Z-API (`sourceId` / `sourceUrl`), que e o que a Miranda usa. Copiar o
  mapeamento da Miranda daria `source_id` vazio, sem erro nenhum.
- O bloco em bruto pesa **~4,4 KB**, quase tudo base64 de thumbnail. Por isso a
  expressao filtra `thumbnail`, `JPEGThumbnail`, `thumbnailURL`,
  `originalImageURL` e qualquer string acima de 300 caracteres: 4438 B passam a
  525 B, sem perder nada consultavel.
- `entryPointConversionSource: 'ctwa_ad'` e `clickToWhatsappCall: true`
  confirmam a decisao de derivar o tipo do canal: o anuncio estava no Facebook
  (`sourceApp: 'facebook'`) mas a conversa e WhatsApp, logo `ctwa`.

Por isso a expressao do Passo 2 aceita **duas** fontes: `body._anuncio` quando
alguem ja normalizou (Miranda), e o `externalAdReply` cru quando ninguem
normalizou (Detail no WhatsApp). Continua a ser a mesma expressao nos dois
clientes.

### Caminho Meta: resolvido na Miranda, exige codigo no Detail

Um webhook real de DM do Instagram da Miranda fechou este caminho. O `referral`
chega em `entry[0].messaging[0].message.referral` (nao em `messaging.referral`),
o ID do anuncio e `ad_id` e o titulo esta aninhado em
`ads_context_data.ad_title`:

```json
"referral": {
  "source": "ADS", "type": "OPEN_THREAD", "ad_id": "120243233376030780",
  "ads_context_data": { "ad_title": "AD 3 - DEPILACAO A LASER FOTO_Group_1", "post_id": "..." }
}
```

**A Miranda nao precisa de alteracao nenhuma.** O `Normalizar Entrada Meta
Omnichannel` dela ja traduz isto para `body._anuncio = { id, titulo, ref,
origem, foto, video }`, e a expressao do Passo 2 ja le `id` e `titulo`.
Verificado a correr o bloco real do no contra o payload real: sai
`instagram_ad` / `120243233376030780` / `AD 3 - DEPILACAO A LASER FOTO_Group_1`,
391 B em `origem_dados`.

**O Detail precisa de uma alteracao de codigo, e nao e opcional.** O
normalizador Meta do Detail **reconstroi o `body` de raiz** — nao propaga `entry`
nem `messaging`. Quando o item chega ao `Entrada Unificada`, o `referral` ja nao
existe. Nenhum fallback na expressao o pode recuperar: o dado foi destruido a
montante. Por isso o Passo 2A abaixo e necessario no Detail e dispensavel na
Miranda.

#### Passo 2A (so Detail) — produzir `_anuncio` no normalizador Meta

No no `Normalizar Entrada Meta Omnichannel`, inserir logo depois de
`const message = messaging.message;`:

```javascript
    // === ANUNCIO / REFERRAL (Fase 1 - atribuicao de origem) ===
    // A Meta manda "referral" APENAS na primeira mensagem do lead que veio
    // de anuncio. Este normalizador reconstroi o body de raiz, portanto se
    // o bloco nao for copiado aqui desaparece antes do Entrada Unificada.
    const referral =
      message.referral ||
      messaging.referral ||
      (messaging.postback || {}).referral ||
      {};
    const adsCtx = referral.ads_context_data || {};
    const anuncio = (referral.ad_id || adsCtx.ad_title || referral.ref)
      ? {
          id: referral.ad_id || '',
          titulo: adsCtx.ad_title || '',
          ref: referral.ref || '',
          origem: referral.source || '',
          foto: adsCtx.photo_url || '',
          video: adsCtx.video_url || ''
        }
      : null;
```

E no objecto de saida, depois de `_identificador: identificador,`:

```javascript

          _anuncio:
            anuncio,
```

A ancora e `_identificador` e nao `_canal` de proposito: `_canal: canal,`
aparece duas vezes no ficheiro (o ramo de modo de teste tambem o tem) e
`_identificador: identificador,` so existe no ramo de producao.

Verificado contra o codigo real do no: `referral`, `adsCtx` e `anuncio` nao
colidem com nomes existentes, estao no mesmo nivel de chaves que o
`resultados.push`, e com o patch aplicado o resto do `body` sai **byte a byte
identico** ao original em tres payloads (IG com `referral`, IG sem, Messenger
sem).

#### O que a Meta nao garante

A Meta **nao inclui sempre** o `referral`, mesmo em conversas que vieram de
anuncio — confirmado pelo Arthur num caso Messenger real. Consequencias:

- Ausencia de `referral` **nao** prova origem organica. O `organico` desta fase
  significa "sem anuncio identificado", nao "sem anuncio".
- O CAC calculado pelo `origem_source_id` e um **limite inferior** de leads por
  campanha. Nao tratar a diferenca como leads organicos.

Relacionado, e **fora do ambito**: o normalizador do Detail descarta eventos sem
`messaging.message`, o que inclui os `postback` de anuncio (lead toca na pergunta
pre-configurada). A Miranda ja converte esses postbacks em mensagem; o Detail
nao. Isso custa-lhe a resposta ao lead **e** a atribuicao, mas e uma correccao
de comportamento do agente, nao da Fase 1.

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
