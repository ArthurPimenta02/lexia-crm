import "server-only";

import { assinarMidias } from "@/lib/conversations/media-urls";
import {
  prepareConversationMessages,
  type ConversationMessageRecord,
  type DisplayConversationMessage,
} from "@/lib/conversations/message-display";
import { getConversationLocks, listAgentLocks, type AgentLock } from "@/lib/redis/agent-locks";
import { ehContaDemo, travasDemo } from "@/lib/movel/demo";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerTemperaturas, temperaturaPorConversa, type Temperatura } from "@/lib/temperatura/leitura";

import { listarEsperas } from "./esperas";

/**
 * Conversas do app do iPhone. Tudo preso ao `clienteSlug` do contexto.
 *
 * Consumo do Supabase (plano grátis, 5 GB/mês de saída): a lista lê só as
 * colunas curtas das mensagens dos últimos dias, e o chat lê só a conversa
 * aberta; as atualizações do chat pedem apenas o que chegou depois da última
 * mensagem que o aparelho já tem.
 */

export type Canal = "whatsapp" | "instagram" | "messenger";
export type EstadoConversa = "espera" | "comigo" | "agente";

export type ResumoConversa = {
  canal: Canal;
  conversa: string;
  esperaDesde: string | null;
  estado: EstadoConversa;
  nome: string;
  previa: string;
  previaDe: "cliente" | "agente" | "equipe";
  quando: string;
  telefone: string | null;
  temperatura: Temperatura | null;
};

export const DIAS_DA_LISTA = 14;

export function canalDe(conversa: string): Canal {
  const c = conversa.split(":")[0];
  return c === "instagram" || c === "messenger" ? c : "whatsapp";
}

export function telefoneDe(conversa: string) {
  const m = /^whatsapp:(\d{6,})$/.exec(conversa);
  return m ? m[1] : null;
}

/** +351 912 345 678 a partir dos dígitos (só para mostrar). */
export function telefoneLegivel(digitos: string | null) {
  if (!digitos) return null;
  const pais = digitos.startsWith("351") ? 3 : digitos.startsWith("55") || digitos.startsWith("34") ? 2 : 1;
  const nacional = digitos.slice(pais);
  // EUA/Canadá: 617 555 0110 (e não 617 555 011 0).
  const resto = pais === 1 && nacional.length === 10 ? `${nacional.slice(0, 3)} ${nacional.slice(3, 6)} ${nacional.slice(6)}` : nacional.replace(/(\d{3})(?=\d)/g, "$1 ");
  return `+${digitos.slice(0, pais)} ${resto}`.trim();
}

export function quemEscreveu(direccao: string | null, origem: string | null): "cliente" | "agente" | "equipe" {
  if (direccao !== "enviada") return "cliente";
  return origem === "humano" ? "equipe" : "agente";
}

/**
 * Em que estado está cada conversa:
 * - espera: a última mensagem é do cliente, chegou com o agente em pausa e
 *   ninguém respondeu (o mesmo critério dos avisos do iPhone);
 * - comigo: a equipa assumiu (pausa manual ou intervenção ativa no Redis), ou
 *   a última mensagem enviada foi da equipa;
 * - agente: o resto.
 */
export function estadoDe(
  ultimas: { direccao: string | null; origem: string | null; criado_em: string | null }[],
  travas: AgentLock[],
): { estado: EstadoConversa; esperaDesde: string | null } {
  // ultimas: mensagens da conversa em ordem crescente
  let esperaDesde: string | null = null;
  for (const m of ultimas) {
    if (m.direccao === "enviada") esperaDesde = null;
    else if (m.origem === "recebida_na_pausa" && !esperaDesde) esperaDesde = m.criado_em;
  }
  if (esperaDesde) return { estado: "espera", esperaDesde };
  const travada = travas.some((t) => t.kind === "pausa_manual" || t.kind === "pausa_eterna" || (t.kind === "status" && t.reason !== "handoff"));
  const ultimaEnviada = [...ultimas].reverse().find((m) => m.direccao === "enviada");
  if (travada || ultimaEnviada?.origem === "humano") return { estado: "comigo", esperaDesde: null };
  return { estado: "agente", esperaDesde: null };
}

type Linha = { id: string; identificador_conversa: string; direccao: string | null; origem: string | null; tipo: string | null; conteudo: string | null; criado_em: string | null };

function previaDe(l: Linha) {
  const [m] = prepareConversationMessages([{ ...l, cliente_slug: "", contacto_id: null, id: "x" }]);
  if (m?.content) return m.content.replace(/\s+/g, " ").slice(0, 140);
  // Sem texto: o tipo da mídia entre colchetes (a tela troca pela palavra no idioma do iPhone).
  return m?.displayType === "audio" ? "[audio]" : m?.displayType === "imagem" ? "[imagem]" : m?.displayType === "video" ? "[video]" : m?.displayType === "documento" ? "[documento]" : "";
}

export async function listarConversas(clienteSlug: string, agora = new Date()): Promise<ResumoConversa[]> {
  const base = createAdminClient();
  const desde = new Date(agora.getTime() - DIAS_DA_LISTA * 86_400_000).toISOString();
  const linhas: Linha[] = [];
  for (let de = 0; de < 12_000; de += 1000) {
    const { data, error } = await base
      .from("lexia_mensagens")
      .select("id, identificador_conversa, direccao, origem, tipo, criado_em")
      .eq("cliente_slug", clienteSlug)
      .gte("criado_em", desde)
      .order("criado_em", { ascending: true })
      .range(de, de + 999);
    if (error) throw new Error("Não foi possível ler as conversas.");
    linhas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }

  const porConversa = new Map<string, Linha[]>();
  for (const l of linhas) {
    const lista = porConversa.get(l.identificador_conversa) ?? [];
    lista.push(l);
    porConversa.set(l.identificador_conversa, lista);
  }

  const conversas = [...porConversa.keys()];
  // O texto só da última mensagem de cada conversa (é o que a lista mostra).
  const idsUltimas = conversas.map((c) => porConversa.get(c)!.at(-1)!.id);
  const conteudos = new Map<string, string | null>();
  for (let i = 0; i < idsUltimas.length; i += 200) {
    const { data } = await base.from("lexia_mensagens").select("id, conteudo").eq("cliente_slug", clienteSlug).in("id", idsUltimas.slice(i, i + 200));
    for (const m of data ?? []) conteudos.set(m.id, m.conteudo);
  }
  for (const c of conversas) {
    const u = porConversa.get(c)!.at(-1)!;
    u.conteudo = conteudos.get(u.id) ?? null;
  }
  const [fichas, travas, esperas, temperaturas] = await Promise.all([
    conversas.length
      ? base.from("lexia_contactos").select("identificador_conversa, nome, telefone").eq("cliente_slug", clienteSlug).in("identificador_conversa", conversas.slice(0, 1000))
      : Promise.resolve({ data: [] as { identificador_conversa: string; nome: string | null; telefone: string | null }[] }),
    (ehContaDemo(clienteSlug) ? travasDemo() : listAgentLocks(clienteSlug)).catch(() => ({ locks: [] as AgentLock[] })),
    listarEsperas(clienteSlug, agora).catch(() => []),
    lerTemperaturas(base, clienteSlug).catch(() => new Map()),
  ]);
  // "À espera" vem SEMPRE da lista única (lib/movel/esperas.ts): é o mesmo
  // número da aba, do chip e do ícone do iPhone.
  const esperaPor = new Map(esperas.map((e) => [e.conversa, e.desde]));
  const nomes = new Map((fichas.data ?? []).map((f) => [f.identificador_conversa, f]));
  const travasPor = new Map<string, AgentLock[]>();
  for (const t of travas.locks ?? []) {
    const lista = travasPor.get(t.identificadorConversa) ?? [];
    lista.push(t);
    travasPor.set(t.identificadorConversa, lista);
  }

  return conversas
    .map((conversa) => {
      const ms = porConversa.get(conversa)!;
      const ultima = ms[ms.length - 1];
      const ficha = nomes.get(conversa);
      const tel = telefoneDe(conversa) ?? (ficha?.telefone ? String(ficha.telefone).replace(/\D/g, "") : null);
      const calculado = estadoDe(ms.slice(-40), travasPor.get(conversa) ?? []);
      const esperaDesde = esperaPor.get(conversa) ?? null;
      // Pausada com o cliente sem resposta há mais de 48 h: está com a equipa, mas já não conta como espera.
      const estado: EstadoConversa = esperaDesde ? "espera" : calculado.estado === "espera" ? "comigo" : calculado.estado;
      return {
        canal: canalDe(conversa),
        conversa,
        esperaDesde,
        estado,
        nome: (ficha?.nome || "").trim() || telefoneLegivel(tel) || "",
        previa: previaDe(ultima),
        previaDe: quemEscreveu(ultima.direccao, ultima.origem),
        quando: ultima.criado_em ?? "",
        telefone: tel,
        temperatura: (temperaturas.get(conversa)?.temperatura as Temperatura | undefined) ?? null,
      };
    })
    .sort((a, b) => (a.quando < b.quando ? 1 : -1));
}

export type DetalheConversa = {
  canal: Canal;
  conversa: string;
  /** Desde quando o cliente espera (só nas últimas 48 h, a regra da lista de esperas). */
  esperaDesde: string | null;
  estado: EstadoConversa;
  temperatura: Temperatura | null;
  mensagens: DisplayConversationMessage[];
  nome: string;
  telefone: string | null;
  ultimaRecebida: string | null;
};

export const LIMITE_MENSAGENS = 120;

/** As mensagens de uma conversa (as últimas 120), com a mídia assinada. `desde` = só as novas. */
export async function lerConversa(clienteSlug: string, conversa: string, desde?: string | null): Promise<DetalheConversa | null> {
  const base = createAdminClient();
  let q = base
    .from("lexia_mensagens")
    .select("id, cliente_slug, contacto_id, identificador_conversa, direccao, tipo, conteudo, origem, criado_em")
    .eq("cliente_slug", clienteSlug)
    .eq("identificador_conversa", conversa);
  if (desde) q = q.gt("criado_em", desde);
  const { data, error } = await q.order("criado_em", { ascending: false }).limit(LIMITE_MENSAGENS);
  if (error) throw new Error("Não foi possível ler a conversa.");
  const registos = [...((data ?? []) as ConversationMessageRecord[])].reverse();
  if (!desde && registos.length === 0) return null;

  const [ficha, travas, temperatura] = await Promise.all([
    base.from("lexia_contactos").select("nome, telefone").eq("cliente_slug", clienteSlug).eq("identificador_conversa", conversa).maybeSingle(),
    (ehContaDemo(clienteSlug) ? travasDemo(conversa) : getConversationLocks(clienteSlug, conversa)).catch(() => ({ locks: [] as AgentLock[] })),
    desde ? Promise.resolve(null) : temperaturaDaConversa(clienteSlug, conversa).catch(() => null),
  ]);
  const mensagens = await assinarMidias(prepareConversationMessages(registos), clienteSlug);
  const tel = telefoneDe(conversa) ?? (ficha.data?.telefone ? String(ficha.data.telefone).replace(/\D/g, "") : null);
  const ultimaRecebida = [...registos].reverse().find((m) => m.direccao !== "enviada")?.criado_em ?? null;

  const { estado, esperaDesde } = estadoDe(registos.slice(-40), travas.locks ?? []);
  const recente = esperaDesde && Date.now() - Date.parse(esperaDesde) < 48 * 3600_000 ? esperaDesde : null;
  return {
    canal: canalDe(conversa),
    conversa,
    esperaDesde: recente,
    estado: estado === "espera" && !recente ? "comigo" : estado,
    mensagens,
    nome: (ficha.data?.nome || "").trim() || telefoneLegivel(tel) || "",
    telefone: tel,
    temperatura: temperatura?.temperatura ?? null,
    ultimaRecebida,
  };
}

/** A temperatura atual de uma conversa (o evento mais recente) e o motivo. */
export async function temperaturaDaConversa(clienteSlug: string, conversa: string) {
  const { data } = await createAdminClient()
    .from("lexia_eventos")
    .select("identificador_conversa, ocorrido_em, dados")
    .eq("cliente_slug", clienteSlug)
    .eq("tipo", "lead_temperatura")
    .eq("identificador_conversa", conversa)
    .order("ocorrido_em", { ascending: false })
    .limit(1);
  return temperaturaPorConversa((data ?? []) as Parameters<typeof temperaturaPorConversa>[0]).get(conversa) ?? null;
}
