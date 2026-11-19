/**
 * Recuperar a origem de anúncio das fichas antigas, com a MESMA regra que a
 * base passa a aplicar às novas (lib/meta/origem-anuncio.ts ↔ migration
 * 202611190019_atribuicao_padrao.sql).
 *
 * Por omissão é um ENSAIO: só lê, conta quantas fichas mudariam (por cliente e
 * canal, e por fonte: referral da Meta ou frase pronta) e mostra um exemplo.
 * Só escreve com --escrever, e cada escrita volta a filtrar pelo estado actual
 * (nunca rebaixa uma ficha que entretanto ganhou origem).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/recuperar-origens.mts
 *   … --clientes=detail_by_cordeiro,miranda_skin_experts --desde=2026-09-20
 *   … --escrever            (SÓ depois do OK do Arthur)
 */
import { extrairReferraisDoWebhook } from "@/lib/meta/webhooks";
import {
  FRASES_INICIAIS,
  type FraseDeAnuncio,
  type ReferralDaConversa,
  origemRecuperada,
} from "@/lib/meta/origem-anuncio";

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? "sim"] as const;
}));
const ESCREVER = args.get("escrever") === "sim";
const DESDE = args.get("desde") ?? "2026-09-20";
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CHAVE) throw new Error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local).");
const H = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` };

async function ler<T>(caminho: string): Promise<T[]> {
  const out: T[] = [];
  for (let o = 0; ; o += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, { headers: { ...H, Range: `${o}-${o + 999}` } });
    if (!r.ok) throw Object.assign(new Error(`${caminho.split("?")[0]}: HTTP ${r.status}`), { status: r.status });
    const pagina = (await r.json()) as T[];
    out.push(...pagina);
    if (pagina.length < 1000) return out;
  }
}

async function frasesDaBase(): Promise<{ frases: readonly FraseDeAnuncio[]; deOnde: string }> {
  try {
    const f = await ler<FraseDeAnuncio & { activa: boolean }>("lexia_frases_anuncio?select=cliente_slug,frase,campanha_externa_id,activa");
    return { frases: f.filter((x) => x.activa), deOnde: "tabela lexia_frases_anuncio" };
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
    return { frases: FRASES_INICIAIS, deOnde: "FRASES_INICIAIS (a migration ainda não correu)" };
  }
}

type Ficha = { id: string; cliente_slug: string; identificador_conversa: string; criado_em: string; origem_tipo: string | null; origem_source_id: string | null };
type Msg = { identificador_conversa: string; conteudo: string | null; criado_em: string };
type Cru = { corpo: unknown; recebido_em: string };

const mascarar = (id: string) => id.replace(/(:.{3}).*(.{2})$/, "$1…$2");
const canalDe = (id: string) => id.split(":")[0];

const { frases, deOnde } = await frasesDaBase();
const todos = (await ler<{ slug: string }>("lexia_clientes?select=slug")).map((c) => c.slug);
const clientes = args.get("clientes")?.split(",") ?? todos.filter((s) => !/teste/.test(s));
console.log(`${ESCREVER ? "ESCRITA" : "ENSAIO (nada é escrito)"} · conversas com a 1.ª mensagem desde ${DESDE} · frases: ${deOnde}\n`);

let escritas = 0;
for (const slug of clientes) {
  const s = encodeURIComponent(slug);
  const fichas = await ler<Ficha>(`lexia_contactos?select=id,cliente_slug,identificador_conversa,criado_em,origem_tipo,origem_source_id&cliente_slug=eq.${s}&fundido_em=is.null&order=criado_em.asc`);
  const msgs = await ler<Msg>(`lexia_mensagens?select=identificador_conversa,conteudo,criado_em&cliente_slug=eq.${s}&direccao=eq.recebida&order=criado_em.asc,id.asc`);
  const crus = await ler<Cru>(`lexia_webhooks_meta?select=corpo,recebido_em&cliente_slug=eq.${s}&corpo->>object=in.(page,instagram,whatsapp_business_account)`);
  const anuncios = await ler<{ anuncio_externo_id: string; campanha_externa_id: string | null }>(`lexia_anuncios?select=anuncio_externo_id,campanha_externa_id&cliente_slug=eq.${s}`);
  const campanha = new Map(anuncios.map((a) => [a.anuncio_externo_id, a.campanha_externa_id]));

  const primeira = new Map<string, Msg>();
  for (const m of msgs) if (!primeira.has(m.identificador_conversa)) primeira.set(m.identificador_conversa, m);

  const referrais = new Map<string, ReferralDaConversa[]>();
  for (const c of crus) {
    const objecto = (c.corpo as { object?: string })?.object;
    for (const a of extrairReferraisDoWebhook(c.corpo)) {
      if (!a.anuncioExternoId || !a.remetenteExternoId) continue;
      const canal = a.caminho === "whatsapp.messages.referral" ? "whatsapp" : objecto === "instagram" ? "instagram" : "messenger";
      const id = `${canal}:${a.remetenteExternoId}`;
      referrais.set(id, [...(referrais.get(id) ?? []), { anuncioExternoId: a.anuncioExternoId, titulo: a.anuncioContexto?.titulo ?? null, caminho: a.caminho, canal, recebidoEm: c.recebido_em }]);
    }
  }

  const porCanal = new Map<string, { conversas: number; jaAnuncio: number; frase: number; referral: number }>();
  const exemplos: string[] = [];
  for (const f of fichas) {
    if (f.identificador_conversa.startsWith("teste")) continue;
    const p = primeira.get(f.identificador_conversa);
    if ((p?.criado_em ?? f.criado_em) < DESDE) continue;
    const canal = canalDe(f.identificador_conversa);
    const t = porCanal.get(canal) ?? { conversas: 0, jaAnuncio: 0, frase: 0, referral: 0 };
    porCanal.set(canal, t);
    t.conversas++;
    if (f.origem_tipo && f.origem_tipo !== "organico") t.jaAnuncio++;
    const nova = origemRecuperada(f, p?.conteudo ?? null, referrais.get(f.identificador_conversa) ?? [], frases, campanha);
    if (!nova) continue;
    t[nova.fonte === "referral" ? "referral" : "frase"]++;
    if (exemplos.length < 2 || (nova.fonte === "referral" && !exemplos.some((e) => e.includes("referral")))) {
      exemplos.push(`  ex.: ${mascarar(f.identificador_conversa)} (${f.origem_tipo ?? "sem origem"}) → ${nova.origem_tipo} via ${nova.fonte}${nova.origem_source_id ? ` ad ${nova.origem_source_id}` : ` "${String(nova.origem_dados.frase)}"`}`);
    }
    if (ESCREVER) {
      const filtro = nova.fonte === "referral"
        ? `id=eq.${f.id}&origem_source_id=is.null`
        : `id=eq.${f.id}&origem_source_id=is.null&or=(origem_tipo.is.null,origem_tipo.eq.organico)`;
      const r = await fetch(`${URL_BASE}/rest/v1/lexia_contactos?${filtro}`, {
        method: "PATCH",
        headers: { ...H, "content-type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          origem_tipo: nova.origem_tipo, origem_source_id: nova.origem_source_id, origem_titulo: nova.origem_titulo,
          origem_dados: { ...nova.origem_dados, recuperado_em: new Date().toISOString() }, origem_capturada_em: new Date().toISOString(),
        }),
      });
      if (!r.ok) throw new Error(`PATCH ${f.id}: HTTP ${r.status}`);
      escritas++;
    }
  }

  const total = [...porCanal.values()].reduce((a, t) => ({ conversas: a.conversas + t.conversas, jaAnuncio: a.jaAnuncio + t.jaAnuncio, frase: a.frase + t.frase, referral: a.referral + t.referral }), { conversas: 0, jaAnuncio: 0, frase: 0, referral: 0 });
  console.log(`${slug}: ${total.conversas} conversas, ${total.jaAnuncio} já com anúncio → passariam a anúncio ${total.frase + total.referral} (frase ${total.frase}, referral ${total.referral}); ficariam ${total.jaAnuncio + total.frase + total.referral}`);
  for (const [canal, t] of [...porCanal].sort()) console.log(`  ${canal.padEnd(10)} ${String(t.conversas).padStart(4)} conversas · já ${t.jaAnuncio} · +${t.frase} frase · +${t.referral} referral`);
  for (const e of exemplos.slice(0, 3)) console.log(e);
  console.log("");
}
if (ESCREVER) console.log(`${escritas} ficha(s) escrita(s).`);
