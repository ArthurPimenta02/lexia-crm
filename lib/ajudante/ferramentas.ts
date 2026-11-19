import "server-only";

import { getPainelCampanhas } from "@/lib/campaigns/read";
import { listarConversas, lerConversa, quemEscreveu, telefoneLegivel } from "@/lib/movel/conversas";
import { chaveDoDia, partesNoFuso } from "@/lib/movel/formato";
import { dadosHoje, limitesDoDia, somarDias } from "@/lib/movel/hoje";
import { dadosResultados, diasDoIntervalo } from "@/lib/movel/resultados";
import { getServicosAgendaveis } from "@/lib/servicos/read";
import { createAdminClient } from "@/lib/supabase/admin";

import { consultaLivre } from "./ferramentas/consulta";
import { fichaAgente } from "./ferramentas/ficha-agente";
import { FERRAMENTAS_LEITURA, usarNumerosDoNegocio } from "./ferramentas/leitura";
import { numeros, numerosDoNegocio } from "./ferramentas/numeros";

/**
 * As ferramentas do Analista Lexia (o ajudante do dono).
 *
 * REGRA DE OURO: a empresa NUNCA vem do modelo. Cada ferramenta recebe o
 * `Escopo` montado no servidor a partir da sessão (contextoDaEmpresa), e todas
 * as leituras levam `.eq("cliente_slug", escopo.clienteSlug)`. O modelo só
 * escolhe datas, textos de procura e o identificador de uma conversa — e esse
 * identificador volta a ser filtrado pela empresa.
 *
 * Todas só LEEM, menos `propor_mensagem`, que não envia nada: devolve uma
 * proposta que a tela mostra com um botão de confirmar. Quem envia é o dono.
 */

export type Escopo = { clienteSlug: string; clienteNome: string; fuso: string; locale: string };

export type Proposta = { tipo: "mensagem"; conversa: string; nome: string; texto: string };

type Saida = { dados: unknown; proposta?: Proposta };

type Definicao = {
  descricao: string;
  executar: (escopo: Escopo, args: Record<string, unknown>) => Promise<Saida>;
  parametros: Record<string, unknown>;
  rotulo: string; // o que a tela mostra enquanto corre ("Vendo a agenda…")
};

const MAX_DIAS = 92;
/** O assistente vê 60 dias de conversas (o app do iPhone continua com 14), mas devolve no máximo 40. */
export const DIAS_CONVERSAS = 60;
export const MAX_CONVERSAS = 40;
const diaOk = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Período pedido pelo modelo, limpo: datas válidas, no máximo 92 dias, nunca invertido. */
export function periodo(args: Record<string, unknown>, hoje: string, padrao = 7) {
  let de = diaOk(args.de) ? args.de : somarDias(hoje, -(padrao - 1));
  let ate = diaOk(args.ate) ? args.ate : hoje;
  if (de > ate) [de, ate] = [ate, de];
  const minimo = somarDias(ate, -(MAX_DIAS - 1));
  if (de < minimo) de = minimo;
  return { ate, de };
}

const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const hora = (iso: string, fuso: string) => partesNoFuso(iso, fuso).hora;

const objeto = (props: Record<string, unknown>, obrigatorios: string[] = []) => ({
  additionalProperties: false,
  properties: props,
  required: obrigatorios,
  type: "object",
});
const DATA = { description: "Data AAAA-MM-DD no fuso da empresa", type: "string" };

/**
 * As conversas destas que vieram de anúncio, com o nome do anúncio e da
 * campanha. Mesma regra da tela de campanhas e da ficha: a ficha
 * (lexia_contactos) diz se veio de anúncio (`origem_tipo` diferente de
 * orgânico) e o id do anúncio (`origem_source_id`); o nome vem de
 * lexia_anuncios e, sem ele, do título que veio com a mensagem.
 */
async function origensDeAnuncio(clienteSlug: string, conversas: string[]) {
  const base = createAdminClient();
  const fichas: { identificador_conversa: string; origem_tipo: string | null; origem_source_id: string | null; origem_titulo: string | null }[] = [];
  for (let i = 0; i < conversas.length; i += 200) {
    const { data, error } = await base
      .from("lexia_contactos")
      .select("identificador_conversa, origem_tipo, origem_source_id, origem_titulo")
      .eq("cliente_slug", clienteSlug)
      .in("identificador_conversa", conversas.slice(i, i + 200))
      .not("origem_tipo", "is", null)
      .neq("origem_tipo", "organico");
    if (error) throw new Error("origens");
    fichas.push(...((data ?? []) as typeof fichas));
  }
  const ids = [...new Set(fichas.map((f) => f.origem_source_id?.trim()).filter((x): x is string => Boolean(x)))];
  const anuncios = new Map<string, { nome: string | null; campanha_nome: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await base.from("lexia_anuncios").select("anuncio_externo_id, nome, campanha_nome").eq("cliente_slug", clienteSlug).in("anuncio_externo_id", ids.slice(i, i + 200));
    for (const x of data ?? []) anuncios.set(x.anuncio_externo_id as string, { campanha_nome: (x.campanha_nome as string | null) ?? null, nome: (x.nome as string | null) ?? null });
  }
  const origens = new Map<string, { anuncio: string | null; campanha: string | null }>();
  for (const f of fichas) {
    if (!f.origem_tipo || f.origem_tipo === "organico") continue;
    const a = f.origem_source_id ? anuncios.get(f.origem_source_id.trim()) : undefined;
    origens.set(f.identificador_conversa, { anuncio: a?.nome?.trim() || f.origem_titulo?.trim() || null, campanha: a?.campanha_nome?.trim() || null });
  }
  return origens;
}

export const FERRAMENTAS: Record<string, Definicao> = {
  resumo: {
    descricao: "Números do negócio num período: agendamentos (pelo agente e à mão), cancelados, conversas, leads novos (e de anúncio), gasto em anúncios, e os mesmos números do período anterior para comparar. Use para perguntas de 'como foi', 'quantos', 'comparado com'.",
    executar: async (e, a) => {
      const hoje = chaveDoDia(new Date(), e.fuso);
      const p = periodo(a, hoje);
      const d = await dadosResultados(e.clienteSlug, e.fuso, { ...p, chave: "personalizado" });
      return { dados: { anterior: d.anterior, anuncios_com_mais_leads: d.anuncios, atual: d.atual, dias: diasDoIntervalo(p), gasto_anuncios: d.gasto, leads_por_dia: d.leadsPorDia, moeda: d.moeda, periodo: p } };
    },
    parametros: objeto({ ate: DATA, de: DATA }, ["de", "ate"]),
    rotulo: "Vendo os números",
  },

  agenda: {
    descricao: "Agendamentos marcados entre duas datas (por dia de atendimento): hora, cliente, serviço, profissional, estado, se foi o agente que marcou e o valor quando existe. No máximo 31 dias.",
    executar: async (e, a) => {
      const hoje = chaveDoDia(new Date(), e.fuso);
      const p = periodo(a, hoje, 1);
      const de = p.de;
      const ate = diasDoIntervalo(p) > 31 ? somarDias(de, 30) : p.ate;
      const { data, error } = await createAdminClient()
        .from("lexia_agendamentos")
        .select("inicio, fim, nome_cliente, titulo, servico, executor, estado, origem, valor_previsto, telefone_digitos")
        .eq("cliente_slug", e.clienteSlug)
        .eq("dia_inteiro", false)
        .gte("inicio", limitesDoDia(de, e.fuso).inicio)
        .lt("inicio", limitesDoDia(ate, e.fuso).fim)
        .order("inicio", { ascending: true })
        .limit(300);
      if (error) throw new Error("agenda");
      return {
        dados: {
          agendamentos: (data ?? []).map((m) => ({
            cliente: (m.nome_cliente || m.titulo || "").trim(),
            conversa: m.telefone_digitos ? `whatsapp:${m.telefone_digitos}` : null,
            dia: chaveDoDia(m.inicio, e.fuso),
            estado: m.estado,
            hora: hora(m.inicio, e.fuso),
            marcado_pelo_agente: m.origem === "agente",
            profissional: m.executor,
            servico: m.servico,
            valor: m.valor_previsto,
          })),
          periodo: { ate, de },
        },
      };
    },
    parametros: objeto({ ate: DATA, de: DATA }, ["de", "ate"]),
    rotulo: "Vendo a agenda",
  },

  hoje: {
    descricao: "O que precisa do dono AGORA: clientes à espera de uma pessoa (há quanto tempo e a última mensagem), leads quentes dos últimos 7 dias ainda sem marcação (com o motivo), sinais por pagar, a agenda de hoje e quantos há amanhã.",
    executar: async (e) => {
      const d = await dadosHoje(e.clienteSlug, e.fuso, new Date());
      return {
        dados: {
          agenda_de_hoje: d.agenda.map((m) => ({ cliente: m.nome, hora: hora(m.inicio, e.fuso), profissional: m.executor, servico: m.servico, sinal_por_pagar: m.pendenteSinal })),
          amanha: d.amanha,
          leads_quentes_sem_marcacao: d.quentes,
          a_espera: d.pendencias.filter((p) => p.tipo === "espera").map((p) => ({ conversa: p.conversa, desde: p.tipo === "espera" ? p.desde : null, nome: p.nome, ultima_mensagem: p.tipo === "espera" ? p.previa : null })),
          sinais_por_pagar: d.pendencias.filter((p) => p.tipo === "sinal").map((p) => ({ cliente: p.nome, conversa: p.conversa })),
        },
      };
    },
    parametros: objeto({}),
    rotulo: "Vendo o que está pendente",
  },

  conversas_recentes: {
    descricao: "As conversas dos últimos 60 dias (no máximo 40), da mais recente para a mais antiga: nome, canal, estado (espera = cliente à espera de uma pessoa; comigo = a equipa assumiu; agente = o agente está a responder) e a última mensagem. Opcional: filtrar por estado e/ou só as que vieram de anúncio (aí cada uma traz o nome do anúncio e da campanha de origem, quando se sabe).",
    executar: async (e, a) => {
      const estado = a.estado === "espera" || a.estado === "comigo" || a.estado === "agente" ? a.estado : null;
      const soAnuncio = a.so_anuncio === true;
      let lista = (await listarConversas(e.clienteSlug, new Date(), DIAS_CONVERSAS)).filter((c) => !estado || c.estado === estado);
      const origens = soAnuncio ? await origensDeAnuncio(e.clienteSlug, lista.map((c) => c.conversa)) : null;
      if (origens) lista = lista.filter((c) => origens.has(c.conversa));
      return {
        dados: lista.slice(0, MAX_CONVERSAS).map((c) => ({
          canal: c.canal,
          conversa: c.conversa,
          estado: c.estado,
          nome: c.nome || telefoneLegivel(c.telefone) || "",
          quando: c.quando,
          ultima: c.previa,
          ultima_de: c.previaDe,
          ...(origens ? origens.get(c.conversa) : {}),
        })),
      };
    },
    parametros: objeto(
      {
        estado: { description: "espera, comigo ou agente (opcional)", enum: ["espera", "comigo", "agente", ""], type: "string" },
        so_anuncio: { description: "true = só as conversas de pessoas que vieram de um anúncio", type: "boolean" },
      },
      ["estado", "so_anuncio"],
    ),
    rotulo: "Vendo as conversas",
  },

  ler_conversa: {
    descricao: "Lê as últimas mensagens de UMA conversa (o identificador vem de outra ferramenta, ex.: whatsapp:351912345678). Use para resumir o que o cliente quer ou para escrever uma resposta.",
    executar: async (e, a) => {
      const conversa = texto(a.conversa, 120);
      const d = conversa ? await lerConversa(e.clienteSlug, conversa) : null;
      if (!d) return { dados: { erro: "Conversa não encontrada nesta empresa." } };
      const n = Math.min(60, Math.max(5, Number(a.mensagens) || 30));
      return {
        dados: {
          canal: d.canal,
          estado: d.estado,
          mensagens: d.mensagens.slice(-n).map((m) => ({
            de: quemEscreveu(m.direccao, m.origem),
            quando: m.criado_em,
            texto: m.content || `[${m.displayType}]`,
          })),
          nome: d.nome,
        },
      };
    },
    parametros: objeto({ conversa: { type: "string" }, mensagens: { description: "quantas (5 a 60)", type: "integer" } }, ["conversa", "mensagens"]),
    rotulo: "Lendo a conversa",
  },

  procurar_clientes: {
    descricao: "Procura clientes (fichas) pelo nome ou por parte do número de telefone. Devolve nome, telefone, de onde veio e o identificador da conversa.",
    executar: async (e, a) => {
      const q = texto(a.texto, 60).replace(/[^\p{L}\p{N} -]/gu, " ").trim();
      if (!q) return { dados: [] };
      const digitos = q.replace(/\D/g, "");
      let consulta = createAdminClient()
        .from("lexia_contactos")
        .select("nome, telefone_digitos, identificador_conversa, origem_tipo, criado_em")
        .eq("cliente_slug", e.clienteSlug)
        .is("fundido_em", null)
        .limit(15);
      consulta = digitos.length >= 3 ? consulta.or(`nome.ilike.%${q}%,telefone_digitos.ilike.%${digitos}%`) : consulta.ilike("nome", `%${q}%`);
      const { data, error } = await consulta;
      if (error) throw new Error("clientes");
      return { dados: (data ?? []).map((c) => ({ conversa: c.identificador_conversa, desde: c.criado_em, de_anuncio: Boolean(c.origem_tipo && c.origem_tipo !== "organico"), nome: c.nome, telefone: telefoneLegivel(c.telefone_digitos) })) };
    },
    parametros: objeto({ texto: { type: "string" } }, ["texto"]),
    rotulo: "Procurando clientes",
  },

  campanhas: {
    descricao: "Anúncios da Meta num período: gasto total, leads novos, custo por lead e, por campanha, gasto, leads atribuídos e quantos agendaram (os atribuídos são um mínimo: só contam quem veio com o anúncio identificado).",
    executar: async (e, a) => {
      const hoje = chaveDoDia(new Date(), e.fuso);
      const p = periodo(a, hoje);
      const d = await getPainelCampanhas({ clienteSlug: e.clienteSlug, fim: p.ate, fimIso: limitesDoDia(p.ate, e.fuso).fim, inicio: p.de, inicioIso: limitesDoDia(p.de, e.fuso).inicio, timezone: e.fuso });
      return {
        dados: {
          campanhas: d.porCampanha.map((c) => ({ agendaram: c.marcacoesAtribuidas, estado: c.estado, gasto: c.gasto, leads_atribuidos: c.contactosAtribuidos, nome: c.nome })),
          custo_por_lead: d.custoPorContacto,
          gasto: d.gasto,
          leads_novos: d.contactosNovos,
          moeda: d.moeda,
          periodo: p,
          tem_dados: d.temDados,
        },
      };
    },
    parametros: objeto({ ate: DATA, de: DATA }, ["de", "ate"]),
    rotulo: "Vendo as campanhas",
  },

  servicos: {
    descricao: "O catálogo de serviços que se podem marcar, com o preço base e quem faz cada um.",
    executar: async (e) => {
      const s = await getServicosAgendaveis(e.clienteSlug);
      return { dados: s.map((x) => ({ nome: x.nome, preco_base: x.precoBase, profissionais: x.executores.map((p) => (p as { nome?: string }).nome ?? "").filter(Boolean) })) };
    },
    parametros: objeto({}),
    rotulo: "Vendo os serviços",
  },

  objecoes: {
    descricao: "O que as conversas analisadas dizem num período: as objeções mais comuns, intenções e resultados (vem da análise automática das conversas; pode não cobrir todas).",
    executar: async (e, a) => {
      const hoje = chaveDoDia(new Date(), e.fuso);
      const p = periodo(a, hoje, 30);
      const { data, error } = await createAdminClient()
        .from("lexia_conversation_insights")
        .select("intencao, resultado, objecoes, etapa_comercial")
        .eq("cliente_slug", e.clienteSlug)
        .gte("ultima_mensagem_em", limitesDoDia(p.de, e.fuso).inicio)
        .lt("ultima_mensagem_em", limitesDoDia(p.ate, e.fuso).fim)
        .limit(500);
      if (error) throw new Error("insights");
      const contar = (lista: string[]) => Object.entries(lista.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((x, y) => y[1] - x[1]).slice(0, 10);
      const linhas = data ?? [];
      const objecoes = linhas.flatMap((l) => (Array.isArray(l.objecoes) ? l.objecoes : []).map((o: unknown) => (typeof o === "string" ? o : String((o as { tipo?: string; descricao?: string })?.tipo ?? (o as { descricao?: string })?.descricao ?? ""))).filter(Boolean));
      return { dados: { analisadas: linhas.length, etapas: contar(linhas.map((l) => l.etapa_comercial)), intencoes: contar(linhas.map((l) => l.intencao).filter(Boolean)), objecoes: contar(objecoes), periodo: p, resultados: contar(linhas.map((l) => l.resultado)) } };
    },
    parametros: objeto({ ate: DATA, de: DATA }, ["de", "ate"]),
    rotulo: "Vendo as objeções",
  },

  propor_mensagem: {
    descricao: "Prepara uma mensagem para enviar a um cliente numa conversa. NÃO envia: a tela mostra a mensagem ao dono com um botão para confirmar. Use quando o dono pedir para responder/escrever a alguém. Leia a conversa antes. Escreva no tom do negócio e no idioma do cliente.",
    executar: async (e, a) => {
      const conversa = texto(a.conversa, 120);
      const mensagem = texto(a.texto, 2000);
      const d = conversa ? await lerConversa(e.clienteSlug, conversa) : null;
      if (!d || !mensagem) return { dados: { erro: "Conversa não encontrada nesta empresa ou mensagem vazia." } };
      return { dados: { ok: "Proposta mostrada ao dono; ele confirma o envio." }, proposta: { conversa: d.conversa, nome: d.nome || telefoneLegivel(d.telefone) || "", texto: mensagem, tipo: "mensagem" } };
    },
    parametros: objeto({ conversa: { type: "string" }, texto: { type: "string" } }, ["conversa", "texto"]),
    rotulo: "Preparando a mensagem",
  },

  // As novas (19/11) vão no FIM: a ordem faz parte do prefixo em cache.
  ...numeros,
  ...fichaAgente,
  ...consultaLivre,
  ...FERRAMENTAS_LEITURA,
};

/**
 * O relatório do período leva também os números do painel (secção "Outros
 * números"): só valores planos e já calculados em código, com nomes legíveis.
 */
export async function numerosParaRelatorio(e: Escopo, p: { de: string; ate: string }): Promise<Record<string, unknown> | null> {
  const r = await numerosDoNegocio(e, { agrupar_por: "nenhum", ate: p.ate, comparar_com_periodo_anterior: false, de: p.de });
  const t = r.numeros.total;
  const fat = t.faturamento_dos_realizados;
  const plano: Record<string, unknown> = {
    atendimentos_realizados: t.realizados,
    faturamento_dos_realizados: fat.total,
    ...(fat.marcacoes_com_valor_estimado ? { realizados_com_valor_estimado_pela_tabela: fat.marcacoes_com_valor_estimado } : {}),
    ...(fat.marcacoes_sem_valor ? { realizados_sem_valor: fat.marcacoes_sem_valor } : {}),
    valor_dos_agendamentos_marcados: t.valor_dos_marcados.total,
    custo_por_agendamento_mínimo: t.cac_sobre_todos_os_agendamentos ?? null,
    custo_por_agendamento_de_anúncio_máximo: t.cac_por_agendamento_de_anuncio ?? null,
    conversas_com_pessoa: t.conversas_com_pessoa,
  };
  return Object.fromEntries(Object.entries(plano).filter(([, v]) => typeof v === "number"));
}
usarNumerosDoNegocio(numerosParaRelatorio);

/** As definições no formato da Anthropic (Messages API: name, description, input_schema). Ordem fixa: fazem parte do prefixo em cache. */
export function ferramentasAnthropic() {
  return Object.entries(FERRAMENTAS).map(([name, f]) => ({ description: f.descricao, input_schema: f.parametros, name }));
}
