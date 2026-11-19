import "server-only";

import { chaveDoDia, partesNoFuso } from "@/lib/movel/formato";
import { limitesDoDia } from "@/lib/movel/hoje";
import { createAdminClient } from "@/lib/supabase/admin";

import type { Escopo } from "../ferramentas";
import {
  canalDaConversa,
  DATA,
  type DefinicaoLeitura,
  emParalelo,
  hojeNoFuso,
  normalizar,
  objeto,
  padraoLargo,
  periodoAte,
  quemEscreveu,
  telefoneDaConversa,
  texto,
  textoDaMensagem,
} from "./comum";

/**
 * `procurar_nas_conversas`: procura um texto nas mensagens desta empresa.
 *
 * Caso real (Arthur, 19/11): "quem começou com 'Olá! Gostaria de conhecer mais
 * sobre os pacotes…' e agendou?". Por isso cada ocorrência diz se a frase foi
 * a PRIMEIRA mensagem do cliente na conversa e se a pessoa agendou depois.
 *
 * - Até 180 dias; sem acento e sem pontuação contam igual ("ola" = "Olá!").
 * - Agrupa por conversa (uma linha por pessoa, com quantas vezes apareceu).
 * - Devolve no máximo 50; diz quantas encontrou ao todo e se a procura ficou
 *   incompleta (mais de 3000 mensagens candidatas: pedir período mais curto).
 */

export const MAX_DIAS_BUSCA = 180;
export const MAX_OCORRENCIAS = 50;
const MAX_CANDIDATAS = 3000;
const MAX_PRIMEIRAS = 150;

type Linha = { id: string; identificador_conversa: string; direccao: string | null; origem: string | null; conteudo: string | null; criado_em: string };

/** Trecho de ~240 caracteres à volta da primeira palavra procurada. */
export function trecho(textoOriginal: string, termoNormalizado: string, tamanho = 240) {
  if (textoOriginal.length <= tamanho) return textoOriginal;
  const semAcento = textoOriginal.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const primeira = termoNormalizado.split(" ")[0] ?? "";
  const pos = Math.max(0, primeira ? semAcento.indexOf(primeira) : 0);
  const inicio = Math.max(0, Math.min(pos - 60, textoOriginal.length - tamanho));
  return `${inicio > 0 ? "…" : ""}${textoOriginal.slice(inicio, inicio + tamanho)}${inicio + tamanho < textoOriginal.length ? "…" : ""}`;
}

async function procurar(e: Escopo, a: Record<string, unknown>) {
  const termo = normalizar(texto(a.texto, 300));
  if (termo.replace(/ /g, "").length < 3) return { erro: "Escreva pelo menos 3 letras para procurar." };
  const hoje = hojeNoFuso(e);
  const p = periodoAte(a, hoje, 30, MAX_DIAS_BUSCA);
  const canal = a.canal === "whatsapp" || a.canal === "instagram" || a.canal === "messenger" ? a.canal : null;
  const primeira = a.primeira_mensagem === true;
  // "Primeira mensagem" é sempre a do cliente.
  const quem = primeira ? "cliente" : a.quem === "cliente" || a.quem === "agente" || a.quem === "equipe" ? a.quem : null;
  const agendouFiltro = a.agendou === "sim" || a.agendou === "nao" ? a.agendou : null;

  const base = createAdminClient();
  const inicio = limitesDoDia(p.de, e.fuso).inicio;
  const fim = limitesDoDia(p.ate, e.fuso).fim;
  const candidatas: Linha[] = [];
  for (let de = 0; de < MAX_CANDIDATAS; de += 1000) {
    let q = base
      .from("lexia_mensagens")
      .select("id, identificador_conversa, direccao, origem, conteudo, criado_em")
      .eq("cliente_slug", e.clienteSlug)
      .gte("criado_em", inicio)
      .lt("criado_em", fim)
      .ilike("conteudo", padraoLargo(termo));
    if (quem === "cliente") q = q.neq("direccao", "enviada");
    else if (quem) q = q.eq("direccao", "enviada");
    const { data, error } = await q.order("criado_em", { ascending: false }).range(de, de + 999);
    if (error) throw new Error("mensagens");
    candidatas.push(...((data ?? []) as Linha[]));
    if (!data || data.length < 1000) break;
  }
  const incompleto = candidatas.length >= MAX_CANDIDATAS;

  // Confirmação exata (sem acentos/pontuação) e os outros filtros.
  const certas = candidatas.filter((m) => {
    if (m.identificador_conversa.startsWith("teste:")) return false;
    if (canal && canalDaConversa(m.identificador_conversa) !== canal) return false;
    if (quem && quemEscreveu(m.direccao, m.origem) !== quem) return false;
    return normalizar(textoDaMensagem(m.conteudo)).includes(termo);
  });

  // Uma linha por conversa: a ocorrência MAIS ANTIGA do período (as linhas vêm da mais recente).
  const porConversa = new Map<string, { m: Linha; vezes: number }>();
  for (const m of certas) {
    const atual = porConversa.get(m.identificador_conversa);
    porConversa.set(m.identificador_conversa, { m, vezes: (atual?.vezes ?? 0) + 1 });
  }
  let grupos = [...porConversa.values()].sort((x, y) => (x.m.criado_em < y.m.criado_em ? 1 : -1));

  // Primeira mensagem do cliente na conversa (de sempre, não só do período).
  const ePrimeira = new Map<string, boolean>();
  if (primeira) {
    const verificar = grupos.slice(0, MAX_PRIMEIRAS);
    await emParalelo(verificar, 10, async (g) => {
      const { data } = await base
        .from("lexia_mensagens")
        .select("id, criado_em")
        .eq("cliente_slug", e.clienteSlug)
        .eq("identificador_conversa", g.m.identificador_conversa)
        .neq("direccao", "enviada")
        .order("criado_em", { ascending: true })
        .limit(1);
      ePrimeira.set(g.m.identificador_conversa, (data?.[0] as { id?: string } | undefined)?.id === g.m.id);
    });
    grupos = verificar.filter((g) => ePrimeira.get(g.m.identificador_conversa));
  }

  // Fichas (nome, telefone, se veio de anúncio) e agendamentos, só destas conversas e desta empresa.
  const conversas = grupos.map((g) => g.m.identificador_conversa);
  const fichas = new Map<string, { nome: string | null; telefone_digitos: string | null; origem_tipo: string | null }>();
  for (let i = 0; i < conversas.length; i += 200) {
    const { data } = await base
      .from("lexia_contactos")
      .select("identificador_conversa, nome, telefone_digitos, origem_tipo")
      .eq("cliente_slug", e.clienteSlug)
      .in("identificador_conversa", conversas.slice(i, i + 200));
    for (const f of (data ?? []) as { identificador_conversa: string; nome: string | null; telefone_digitos: string | null; origem_tipo: string | null }[]) fichas.set(f.identificador_conversa, f);
  }
  const telefoneDe = (c: string) => telefoneDaConversa(c) ?? fichas.get(c)?.telefone_digitos ?? null;
  const telefones = [...new Set(conversas.map(telefoneDe).filter((x): x is string => Boolean(x)))];
  const marcacoes = new Map<string, { inicio: string; servico: string | null; estado: string; criado_no_google: string | null }[]>();
  for (let i = 0; i < telefones.length; i += 200) {
    const { data } = await base
      .from("lexia_agendamentos")
      .select("inicio, servico, estado, telefone_digitos, criado_no_google")
      .eq("cliente_slug", e.clienteSlug)
      .eq("dia_inteiro", false)
      .in("telefone_digitos", telefones.slice(i, i + 200))
      .limit(3000);
    for (const m of (data ?? []) as { inicio: string; servico: string | null; estado: string; telefone_digitos: string; criado_no_google: string | null }[]) {
      const lista = marcacoes.get(m.telefone_digitos) ?? [];
      lista.push(m);
      marcacoes.set(m.telefone_digitos, lista);
    }
  }

  const linhas = grupos
    .map((g) => {
      const c = g.m.identificador_conversa;
      const ficha = fichas.get(c);
      const tel = telefoneDe(c);
      // Agendou DEPOIS desta mensagem (marcado no Google depois dela, ou com atendimento depois dela).
      const depois = (tel ? marcacoes.get(tel) ?? [] : []).filter((x) => x.estado !== "cancelado" && (x.criado_no_google ?? x.inicio) >= g.m.criado_em.slice(0, 10));
      const canceladas = (tel ? marcacoes.get(tel) ?? [] : []).filter((x) => x.estado === "cancelado" && x.inicio >= g.m.criado_em.slice(0, 10));
      const quando = partesNoFuso(g.m.criado_em, e.fuso);
      return {
        agendamentos: depois.slice(0, 3).map((x) => ({ dia: chaveDoDia(x.inicio, e.fuso), estado: x.estado, servico: x.servico })),
        agendou: depois.length > 0,
        canal: canalDaConversa(c),
        cancelou: canceladas.length > 0,
        conversa: c,
        de: quemEscreveu(g.m.direccao, g.m.origem),
        de_anuncio: Boolean(ficha?.origem_tipo && ficha.origem_tipo !== "organico"),
        nome: (ficha?.nome ?? "").trim() || null,
        quando: `${quando.chave} ${quando.hora}`,
        trecho: trecho(textoDaMensagem(g.m.conteudo), termo),
        vezes: g.vezes,
        ...(primeira ? { primeira_mensagem: true } : {}),
      };
    })
    .filter((l) => !agendouFiltro || (agendouFiltro === "sim") === l.agendou);

  return {
    conversas_encontradas: linhas.length,
    incompleto: incompleto ? "Havia mensagens demais: a procura olhou só as 3000 mais recentes. Peça um período mais curto." : undefined,
    mostradas: Math.min(linhas.length, MAX_OCORRENCIAS),
    ocorrencias: linhas.slice(0, MAX_OCORRENCIAS),
    periodo: p,
    procurado: texto(a.texto, 300),
    resumo: { agendaram: linhas.filter((l) => l.agendou).length, cancelaram: linhas.filter((l) => l.cancelou).length, de_anuncio: linhas.filter((l) => l.de_anuncio).length },
    ...(primeira && porConversa.size > MAX_PRIMEIRAS ? { aviso: `Só se verificou a primeira mensagem nas ${MAX_PRIMEIRAS} conversas mais recentes.` } : {}),
  };
}

export const procurarNasConversas: DefinicaoLeitura = {
  descricao:
    "Procura um texto ou frase nas mensagens desta empresa (até 180 dias; maiúsculas, acentos e pontuação não contam). Filtros: canal, quem escreveu (cliente, agente ou equipe), 'primeira_mensagem' (só quando a frase foi a primeira mensagem do cliente na conversa) e 'agendou' (sim/nao). Devolve até 50 conversas com nome, data, trecho, se veio de anúncio, se agendou ou cancelou depois, e os totais. Use para 'quem escreveu X', 'quantos começaram com X e agendaram'. Para ler uma delas, use ler_conversa.",
  executar: async (e, a) => ({ dados: await procurar(e, a) }),
  parametros: objeto(
    {
      agendou: { description: "sim = só quem agendou depois; nao = só quem não agendou; vazio = todos", enum: ["sim", "nao", ""], type: "string" },
      ate: DATA,
      canal: { description: "whatsapp, instagram ou messenger (vazio = todos)", enum: ["whatsapp", "instagram", "messenger", ""], type: "string" },
      de: DATA,
      primeira_mensagem: { description: "true = só quando o texto foi a primeira mensagem do cliente na conversa", type: "boolean" },
      quem: { description: "quem escreveu: cliente, agente ou equipe (vazio = qualquer)", enum: ["cliente", "agente", "equipe", ""], type: "string" },
      texto: { description: "o texto ou frase a procurar (pode ser só o começo)", type: "string" },
    },
    ["texto", "de", "ate"],
  ),
  rotulo: "Procurando nas conversas",
};
