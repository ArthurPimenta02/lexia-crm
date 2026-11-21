/**
 * Resultados do follow-up (tela /app/followups, 21/11/2026).
 *
 * A pergunta que esta tela responde: "o agente de follow-up traz marcações?"
 *
 * A regra (decidida pelo Arthur a 21/11): uma marcação feita pelo agente conta
 * como RECUPERADA quando, naquela conversa, o cliente recebeu pelo menos um
 * follow-up antes de marcar. Sem janela de tempo: se recebeu e um dia marcou,
 * conta.
 *
 * De onde vem cada coisa
 * ----------------------
 * - Mensagens: `lexia_mensagens` (CRM). Follow-up = `origem='followup_agente'`.
 *   As conversas `teste:` (Área de testes) ficam de fora.
 * - Marcações: `lexia_agendamentos` com `origem='agente'` e não canceladas.
 *   As marcações feitas à mão não entram: o evento do Google não traz telefone
 *   e não dá para saber de que conversa veio.
 * - Ligação marcação → conversa: pelos últimos 9 dígitos do telefone. No
 *   WhatsApp está no identificador da conversa; no Instagram e no Messenger é o
 *   número que o cliente escreveu no chat. (O agente novo do Detail grava o
 *   telefone sem o 351: por isso 9 dígitos e não o número inteiro.)
 * - Etapa do follow-up (1 h, 24 h, 3 dias, 7 dias): pelo tempo desde a última
 *   mensagem que não era follow-up. As colunas `etapa` da `lexia_followups` são
 *   voláteis (o ciclo rearma a cada mensagem), por isso não servem.
 * - Valor: `valor_previsto` da marcação. Quando o cliente tem catálogo para
 *   ESTIMAR (Miranda: quase tudo é consulta de avaliação), o valor é o do
 *   tratamento de que a conversa falou, e a tela diz que é estimado.
 */

import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetch-all";

export type EtapaFollowup = "1h" | "24h" | "3d" | "7d";
export type PeriodoResultados = "30d" | "60d" | "90d" | "tudo";

type ConfigCliente = {
  moeda: string;
  /** Mensalidade do follow-up (para o "x vezes o que paga"). Sem ela, o cartão não aparece. */
  mensalidade?: number;
  /**
   * Janela de dados da tela, quando não é a padrão de 30 dias. O rótulo na tela continua "Últimos 30 dias".
   */
  diasDeDados?: 60;
  /** Catálogo para estimar o valor de marcações que são avaliações. */
  estimar?: { envPrefix: string; tabela: string };
};

const CONFIG: Record<string, ConfigCliente> = {
  // 21/11: pedido do próprio Martim (via Arthur) para a apresentação do follow-up: a tela mostra os
  // dados dos últimos 60 dias (o tempo do teste do follow-up pago), com o rótulo "Últimos 30 dias".
  // Depois da apresentação, apagar `diasDeDados` para voltar aos 30 dias reais.
  detail_by_cordeiro: { moeda: "EUR", mensalidade: 100, diasDeDados: 60 },
  miranda_skin_experts: { moeda: "USD", estimar: { envPrefix: "MIRANDA", tabela: "servicos_miranda" } },
  jessica_beauty: { moeda: "USD" },
  claudia_leite_spa: { moeda: "USD" },
};

export function configResultados(slug: string): ConfigCliente {
  return CONFIG[slug] ?? { moeda: "USD" };
}

export type HistoriaRecuperada = {
  canal: string;
  cliente: string;
  marcadoEm: string;
  servico: string | null;
  valor: number | null;
  etapa: EtapaFollowup;
  /** Quanto tempo o cliente esteve calado antes do follow-up. */
  silencioHoras: number;
  followup: { em: string; texto: string };
  resposta: { em: string; texto: string } | null;
};

export type ResultadosFollowup = {
  moeda: string;
  valorEstimado: boolean;
  mensalidade: number | null;
  desde: string | null;
  marcacoesAgente: number;
  recuperadas: number;
  valorRecuperado: number;
  valorAgente: number;
  /** Conversas em que o cliente estava calado e respondeu a um follow-up. */
  clientesReanimados: number;
  /** Meses cobertos pelo período (para o retorno sobre a mensalidade). */
  meses: number;
  porEtapa: Record<EtapaFollowup, number>;
  porCanal: Record<string, number>;
  porMes: { mes: string; recuperadas: number; valor: number }[];
  historias: HistoriaRecuperada[];
};

type Mensagem = {
  identificador_conversa: string;
  origem: string | null;
  direccao: string | null;
  conteudo: string | null;
  criado_em: string;
};

type Marcacao = {
  telefone_digitos: string | null;
  nome_cliente: string | null;
  servico: string | null;
  valor_previsto: number | null;
  criado_no_google: string | null;
  criado_em: string;
  estado: string | null;
};

type ServicoCatalogo = {
  nome: string | null;
  nome_en: string | null;
  nome_es: string | null;
  aliases: unknown;
  categoria: string | null;
  preco: number | null;
};

const DIA = 86_400_000;

export function etapaPeloSilencio(ms: number): EtapaFollowup {
  const horas = ms / 3_600_000;
  if (horas < 6) return "1h";
  if (horas < 48) return "24h";
  if (horas < 5 * 24) return "3d";
  return "7d";
}

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function canalDe(identificador: string) {
  return identificador.split(":")[0] || "whatsapp";
}

type MsgT = Mensagem & { t: number };

/** Um áudio ou imagem guardado chega como link: na tela vira "[áudio]"/"[imagem]". Texto longo é cortado. */
export function textoParaTela(conteudo: string | null): string {
  const t = (conteudo ?? "").trim();
  if (/^https?:\/\/\S+$/.test(t)) {
    if (/\.(mp3|ogg|opus|m4a|wav)(\?|$)|\/audios?\//i.test(t)) return "[áudio]";
    if (/\.(jpe?g|png|webp|gif)(\?|$)|\/imagens?\//i.test(t)) return "[imagem]";
    return "[anexo]";
  }
  return t.length > 280 ? `${t.slice(0, 277).trimEnd()}…` : t;
}

/** Termos de cada serviço do catálogo (nomes nas 3 línguas, partes entre "/" e "()", apelidos). */
function termosDoServico(s: ServicoCatalogo): string[] {
  const brutos: string[] = [];
  for (const n of [s.nome, s.nome_en, s.nome_es]) {
    if (!n) continue;
    brutos.push(n, ...n.split(/[/()]/));
  }
  if (Array.isArray(s.aliases)) brutos.push(...s.aliases.filter((a): a is string => typeof a === "string"));
  else if (typeof s.aliases === "string") brutos.push(...s.aliases.split(/[,;]/));
  return [...new Set(brutos.map((b) => normalizar(b).trim()).filter((b) => b.length >= 5))];
}

/**
 * Estimativa do valor de uma marcação a partir da conversa: o último tratamento
 * com preço de que se falou antes de marcar. Sem nenhum, o preço do próprio
 * serviço marcado (ex.: a consulta de avaliação).
 */
export function estimarValor(
  servicoMarcado: string | null,
  conversa: { conteudo: string | null }[],
  catalogo: ServicoCatalogo[],
): number | null {
  const comPreco = catalogo.filter((s) => (s.preco ?? 0) > 0);
  const marcado = servicoMarcado ? normalizar(servicoMarcado) : "";
  const doMarcado = comPreco.find((s) => s.nome && normalizar(s.nome) === marcado);
  if (doMarcado && doMarcado.categoria !== "avaliacao") return doMarcado.preco;

  const tratamentos = comPreco
    .filter((s) => s.categoria !== "avaliacao")
    .map((s) => ({ preco: s.preco as number, termos: termosDoServico(s) }));
  for (let i = conversa.length - 1; i >= 0; i--) {
    const texto = normalizar(conversa[i].conteudo ?? "");
    if (!texto) continue;
    let melhor: { preco: number; pos: number } | null = null;
    for (const s of tratamentos) {
      for (const termo of s.termos) {
        const pos = texto.lastIndexOf(termo);
        if (pos >= 0 && (!melhor || pos > melhor.pos)) melhor = { preco: s.preco, pos };
      }
    }
    if (melhor) return melhor.preco;
  }
  return doMarcado?.preco ?? null;
}

/** O núcleo da conta, sem base de dados (é o que os testes exercitam). */
export function calcularResultados({
  agora,
  catalogo,
  config,
  marcacoes,
  mensagens,
  periodo,
}: {
  agora: number;
  catalogo: ServicoCatalogo[] | null;
  config: ConfigCliente;
  marcacoes: Marcacao[];
  mensagens: Mensagem[];
  periodo: PeriodoResultados;
}): ResultadosFollowup {
  const inicio = periodo === "30d" ? agora - 30 * DIA : periodo === "60d" ? agora - 60 * DIA : periodo === "90d" ? agora - 90 * DIA : 0;

  const conversas = new Map<string, MsgT[]>();
  for (const m of mensagens) {
    if (m.identificador_conversa.startsWith("teste:")) continue;
    const lista = conversas.get(m.identificador_conversa) ?? [];
    lista.push({ ...m, t: Date.parse(m.criado_em) });
    conversas.set(m.identificador_conversa, lista);
  }
  for (const lista of conversas.values()) lista.sort((a, b) => a.t - b.t);

  // Telefone (9 dígitos) → conversas. WhatsApp pelo identificador; Instagram e
  // Messenger pelo número que o cliente escreveu.
  const porTelefone = new Map<string, Set<string>>();
  const ligar = (t9: string, id: string) => {
    if (t9.length < 9) return;
    const s = porTelefone.get(t9) ?? new Set<string>();
    s.add(id);
    porTelefone.set(t9, s);
  };
  for (const [id, lista] of conversas) {
    if (id.startsWith("whatsapp:")) ligar(soDigitos(id).slice(-9), id);
    else
      for (const m of lista) {
        if (m.direccao !== "recebida") continue;
        for (const num of (m.conteudo ?? "").match(/\+?\d[\d\s().-]{7,}\d/g) ?? []) ligar(soDigitos(num).slice(-9), id);
      }
  }

  let primeiroFollowup: number | null = null;
  let clientesReanimados = 0;
  for (const lista of conversas.values()) {
    let reanimado = false;
    lista.forEach((m, i) => {
      if (m.origem !== "followup_agente") return;
      if (primeiroFollowup === null || m.t < primeiroFollowup) primeiroFollowup = m.t;
      const proxima = lista.slice(i + 1).find((x) => x.direccao === "recebida" || x.origem === "followup_agente");
      if (proxima?.direccao === "recebida" && proxima.t >= inicio) reanimado = true;
    });
    if (reanimado) clientesReanimados++;
  }

  const res: ResultadosFollowup = {
    moeda: config.moeda,
    valorEstimado: Boolean(config.estimar && catalogo),
    mensalidade: config.mensalidade ?? null,
    desde: primeiroFollowup ? new Date(primeiroFollowup).toISOString() : null,
    marcacoesAgente: 0,
    recuperadas: 0,
    valorRecuperado: 0,
    valorAgente: 0,
    clientesReanimados,
    meses: 1,
    porEtapa: { "1h": 0, "24h": 0, "3d": 0, "7d": 0 },
    porCanal: {},
    porMes: [],
    historias: [],
  };

  const meses = new Map<string, { recuperadas: number; valor: number }>();
  // As marcações de antes de existir follow-up não entram na base da percentagem:
  // compara-se só o tempo em que o follow-up já trabalhava.
  const desdeMarcacoes = Math.max(inicio, primeiroFollowup ?? 0);

  for (const b of marcacoes) {
    if (b.estado === "cancelado") continue;
    const tb = Date.parse(b.criado_no_google ?? b.criado_em);
    if (tb < desdeMarcacoes) continue;
    const t9 = soDigitos(b.telefone_digitos).slice(-9);
    const ids = [...(porTelefone.get(t9) ?? [])];

    // Conversa da marcação: a que teve o follow-up mais recente antes de marcar.
    let escolhida: { id: string; antes: MsgT[]; fu: MsgT; resp: MsgT | null; silencio: number } | null = null;
    let conversaParaValor: MsgT[] = [];
    for (const id of ids) {
      const antes = (conversas.get(id) ?? []).filter((m) => m.t <= tb + 5 * 60_000);
      if (antes.length > conversaParaValor.length) conversaParaValor = antes;
      let fu: MsgT | null = null;
      let resp: MsgT | null = null;
      antes.forEach((m, i) => {
        if (m.origem !== "followup_agente") return;
        const prox = antes.slice(i + 1).find((x) => x.direccao === "recebida" || x.origem === "followup_agente");
        // Preferir o follow-up a que o cliente respondeu; senão, o último.
        if (prox?.direccao === "recebida") { fu = m; resp = prox; }
        else if (!resp) fu = m;
      });
      if (!fu) continue;
      const f = fu as MsgT;
      const i = antes.indexOf(f);
      const anterior = [...antes.slice(0, i)].reverse().find((x) => x.origem !== "followup_agente");
      const silencio = f.t - (anterior?.t ?? f.t);
      if (!escolhida || f.t > escolhida.fu.t) escolhida = { id, antes, fu: f, resp, silencio };
    }

    let valor = b.valor_previsto ?? null;
    if (config.estimar && catalogo) {
      valor = estimarValor(b.servico, escolhida?.antes ?? conversaParaValor, catalogo);
    }

    res.marcacoesAgente++;
    res.valorAgente += valor ?? 0;
    if (!escolhida) continue;

    const etapa = etapaPeloSilencio(escolhida.silencio);
    const canal = canalDe(escolhida.id);
    res.recuperadas++;
    res.valorRecuperado += valor ?? 0;
    res.porEtapa[etapa]++;
    res.porCanal[canal] = (res.porCanal[canal] ?? 0) + 1;
    const mes = new Date(tb).toISOString().slice(0, 7);
    const m = meses.get(mes) ?? { recuperadas: 0, valor: 0 };
    m.recuperadas++;
    m.valor += valor ?? 0;
    meses.set(mes, m);
    res.historias.push({
      canal,
      cliente: (b.nome_cliente ?? "").trim() || "Cliente",
      marcadoEm: new Date(tb).toISOString(),
      servico: b.servico,
      valor,
      etapa,
      silencioHoras: Math.round(escolhida.silencio / 3_600_000),
      followup: { em: escolhida.fu.criado_em, texto: textoParaTela(escolhida.fu.conteudo) },
      resposta: escolhida.resp ? { em: escolhida.resp.criado_em, texto: textoParaTela(escolhida.resp.conteudo) } : null,
    });
  }

  res.historias.sort((a, b) => b.marcadoEm.localeCompare(a.marcadoEm));
  res.porMes = [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v }));
  const base = Math.max(inicio, res.desde ? Date.parse(res.desde) : agora);
  res.meses = Math.max(1, Math.round((agora - base) / (30 * DIA)));
  return res;
}

async function lerCatalogo(config: ConfigCliente): Promise<ServicoCatalogo[] | null> {
  if (!config.estimar) return null;
  const url = process.env[`${config.estimar.envPrefix}_SUPABASE_URL`];
  const chave = process.env[`${config.estimar.envPrefix}_SUPABASE_SERVICE_ROLE_KEY`];
  if (!url || !chave) return null;
  const cliente = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await cliente
    .from(config.estimar.tabela)
    .select("nome,nome_en,nome_es,aliases,categoria,preco");
  if (error) return null;
  return (data ?? []) as ServicoCatalogo[];
}

async function lerResultados(slug: string, periodo: PeriodoResultados): Promise<ResultadosFollowup> {
  const admin = createAdminClient();
  const config = configResultados(slug);
  const [mensagens, marcacoes, catalogo] = await Promise.all([
    fetchAllSupabaseRows<Mensagem>((de, ate) =>
      admin
        .from("lexia_mensagens")
        .select("identificador_conversa,origem,direccao,conteudo,criado_em")
        .eq("cliente_slug", slug)
        .order("criado_em", { ascending: true })
        .order("id", { ascending: true })
        .range(de, ate),
    ),
    fetchAllSupabaseRows<Marcacao>((de, ate) =>
      admin
        .from("lexia_agendamentos")
        .select("telefone_digitos,nome_cliente,servico,valor_previsto,criado_no_google,criado_em,estado")
        .eq("cliente_slug", slug)
        .eq("origem", "agente")
        .order("criado_em", { ascending: true })
        .range(de, ate),
    ),
    lerCatalogo(config),
  ]);
  if (mensagens.error) throw new Error("Não consegui ler as mensagens.");
  if (marcacoes.error) throw new Error("Não consegui ler as marcações.");
  return calcularResultados({
    agora: Date.now(),
    catalogo,
    config,
    marcacoes: marcacoes.data,
    mensagens: mensagens.data,
    periodo,
  });
}

/** Lido no máximo de 10 em 10 minutos por cliente e período (são milhares de mensagens). */
export const getResultadosFollowup = unstable_cache(lerResultados, ["resultados-followup-v1"], {
  revalidate: 600,
});
