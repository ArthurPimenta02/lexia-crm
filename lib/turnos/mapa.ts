/**
 * O mapa de um turno: transforma o que o agente em código gravou (passos,
 * IA, ferramentas, ações) no desenho por fases que o Controle do agente
 * mostra, como os nós do n8n mas agrupados em etapas que se leem.
 *
 * Os nomes dos passos são os nomes dos nós do n8n, porque o agente em código
 * corre o mesmo desenho. Um passo que não está na lista herda a fase do passo
 * anterior: assim um nó novo aparece no sítio certo sem mexer aqui.
 */

import type { EventoFerramenta, Passo, TurnoCompleto } from "@/lib/turnos/formatar";

export type EstadoFase = "feito" | "parou" | "erro" | "nao_usado";

export type Fase = {
  id: string;
  titulo: string;
  /** O que esta etapa faz, numa frase, para quem não conhece o agente. */
  explica: string;
  estado: EstadoFase;
  /** O que aconteceu nesta etapa neste turno, em linguagem simples. */
  linhas: string[];
  passos: Passo[];
  /** Consultas que a IA fez nesta etapa (catálogo, agenda…), com o pedido e a resposta. */
  ferramentas: (EventoFerramenta & { titulo: string })[];
  ms: number;
};

/** Uma linha do desenho: uma fase, ou um ramo com caminhos lado a lado. */
export type LinhaFluxo = { tipo: "fase"; fase: Fase } | { tipo: "ramo"; titulo: string; fases: Fase[] };

type Molde = {
  id: string;
  titulo: string;
  explica: string;
  nos?: string[];
  padrao?: RegExp;
  /** Fases do mesmo ramo ficam lado a lado; só uma corre por turno. */
  ramo?: string;
};

const CONVERSA: Molde[] = [
  {
    id: "chegou",
    titulo: "Mensagem chegou",
    explica: "Recebe a mensagem do WhatsApp, Instagram ou Messenger e vê se veio de um anúncio.",
    nos: [
      "Webhook WhatsApp Omnichannel", "Webhook Meta Omnichannel", "Adaptar Entrada Z-API",
      "Normalizar Entrada Meta Omnichannel", "Preparar Perfil Meta", "HTTP Request", "Juntar Nome Meta",
      "Entrada Unificada", "É Cartão de Anúncio?", "Guardar Origem do Cartão", "Esperar 5 Minutos",
      "Buscar Mensagem Recente na Conversa", "Restaurar Mensagem",
    ],
  },
  {
    id: "filtros",
    titulo: "Pode responder?",
    explica: "Confere bloqueios, pausas, se o Samuel está na conversa e se não é eco da própria Carol.",
    nos: [
      "Contatos Bloqueados Meta", "Bloquear Contatos WhatsApp", "Contatos Bloqueados", "Ver Pausa Eterna",
      "CENTRAL DE CONTROLE", "Config Cliente Lexia", "Normalizar Dados Operacionais", "Obter Eco IA Omnichannel",
      "Filtro de Mensagens", "Verificar Intervenção", "Cancelar Follow-up", "Ver Pausa Manual", "Ver Status Agente",
    ],
    padrao: /Pausa|Retomada|Samuel Continuou|Última É do Cliente/,
  },
  {
    id: "buffer",
    titulo: "Juntou as mensagens",
    explica: "Espera 60 segundos para juntar mensagens picadas e entende áudio, foto, PDF ou vídeo.",
    nos: ["Switch", "Texto", "Redis", "Redis_Buffer1", "Redis_Buffer2", "Apagar Buffer1", "Mensagem para o Agente"],
    padrao: /[ÁA]udio|Imagem|PDF|V[íi]deo|Transcrev|Descrev|Baixar|M[íi]dia/,
  },
  {
    id: "leu",
    titulo: "Leu a conversa",
    explica: "Abre a ficha do cliente e o histórico da conversa.",
    nos: [
      "Buscar Contacto", "Criar Contacto", "Actualizar Contacto", "Unificar Contacto",
      "Guardar Mensagem Recebida", "Buscar Histórico da Conversa", "Agrupar Histórico",
    ],
  },
  {
    id: "entendeu",
    titulo: "Entendeu o assunto",
    explica: "O Agente de Contexto resume a conversa e decide o caminho: atendimento ou agendamento.",
    nos: [
      "Obter Contexto Activo", "Preparar Pacote de Contexto", "Agente de Contexto", "Preparar Contexto Activo",
      "Guardar Contexto Activo Genérico", "Preparar Payload Cérebro", "Chamar Cérebro do Cliente",
      "When Executed by Another Workflow", "Preparar Entrada", "Buscar Playbook de Vendas (Cérebro)",
      "Anexar Playbook ao Contexto", "Rotear por Assunto",
    ],
  },
  {
    id: "atendimento",
    titulo: "Atendimento",
    explica: "Tira dúvidas: o Especialista consulta serviços, preços e promoções.",
    nos: ["Orquestrador de Atendimento", "Especialista em Serviços"],
    ramo: "Caminho escolhido",
  },
  {
    id: "agendamento",
    titulo: "Agendamento",
    explica: "Marca, remarca ou cancela: consulta a agenda do Samuel e cria o evento.",
    nos: ["Orquestrador de Agendamento"],
    ramo: "Caminho escolhido",
  },
  {
    id: "indefinido",
    titulo: "Sem assunto claro",
    explica: "Primeiro contato ou mensagem solta: cumprimenta e descobre o que a pessoa quer.",
    nos: ["Agente Indefinido"],
    ramo: "Caminho escolhido",
  },
  {
    id: "redator",
    titulo: "Escreveu a resposta",
    explica: "O Redator escreve na voz da Carol, no idioma do cliente, em no máximo 2 balões.",
    nos: [
      "Preparar Briefing", "Redator — Voz do Cliente", "Montar Saída Final", "Validar Saída Cérebro",
      "Preparar Handoff", "Devolver Saída Cérebro",
    ],
  },
  {
    id: "conferiu",
    titulo: "Conferiu antes de enviar",
    explica: "Guarda o contexto e confere se ninguém da equipe respondeu entretanto.",
    nos: [
      "Validar Saída Cérebro Cliente", "Fundir Contexto Pós-Cérebro", "Guardar Contexto Pós-Cérebro",
      "Preparar Saída Omnichannel", "Humano Respondeu Neste Turno?", "Retomar Saída Após Trava Humana",
    ],
  },
  {
    id: "enviou",
    titulo: "Enviou",
    explica: "Manda os balões ao cliente, com o tempo de digitação, e guarda-os no histórico.",
    padrao: /Split Out|Loop Over Items - Entregas|Registrar Eco|Enviar Digitando|^Wait|Enviar Mensagem|Guardar Mensagem Enviada|No Operation/,
  },
  {
    id: "followup",
    titulo: "Agendou o follow-up",
    explica: "Se o cliente não responder, a Carol volta a escrever mais tarde.",
    nos: ["Preparar Follow-up", "Armar Follow-up"],
  },
];

const FOLLOWUP: Molde[] = [
  {
    id: "fu_hora",
    titulo: "Hora do follow-up",
    explica: "De 15 em 15 minutos, procura conversas em que o cliente parou de responder.",
    nos: ["Schedule Trigger", "Buscar Follow-ups Vencidos"],
  },
  {
    id: "fu_pode",
    titulo: "Pode mandar?",
    explica: "Confere pausas, horário comercial e a janela de 24 h da Meta.",
    nos: ["Travas de Follow-up", "Ver Status Agente (Follow-up)", "Ver Pausa Manual (Follow-up)", "Juntar Travas de Pausa", "Aplicar Pausas (Follow-up)", "Rotear por Ação"],
  },
  {
    id: "fu_leu",
    titulo: "Leu a conversa",
    explica: "Abre o histórico e o playbook de vendas.",
    nos: ["Loop Follow-ups - Leads", "Buscar Histórico Follow-up", "Buscar Playbook de Vendas"],
  },
  {
    id: "fu_juiz",
    titulo: "Juiz decidiu",
    explica: "Decide se vale a pena escrever de novo e com que abordagem.",
    nos: ["Montar Análise do Juiz", "Juiz de Follow-up", "Validar Decisão do Juiz", "Rotear Decisão do Juiz"],
  },
  {
    id: "fu_escreveu",
    titulo: "Escreveu",
    explica: "O Redator de follow-up escreve a mensagem.",
    nos: ["Redator de Follow-up", "Preparar Envio Follow-up"],
  },
  {
    id: "fu_enviou",
    titulo: "Enviou",
    explica: "Manda a mensagem (texto ou áudio) e marca a próxima tentativa.",
    padrao: /./,
  },
];

function moldesDe(t: Pick<TurnoCompleto, "rota" | "passos">): Molde[] | null {
  const wfs = new Set((t.passos ?? []).map((p) => p.workflow));
  if (t.rota === "followup" || wfs.has("followup")) return FOLLOWUP;
  if (t.rota === "lembrete" || wfs.has("lembretes")) return null;
  return CONVERSA;
}

function faseDoPasso(moldes: Molde[], p: Passo): string | null {
  for (const m of moldes) if (m.nos?.includes(p.no)) return m.id;
  for (const m of moldes) if (m.padrao?.test(p.no)) return m.id;
  return null;
}

/**
 * O registo guarda em `ms` o instante em que o passo acabou, contado desde o
 * início do seu workflow. A duração de um passo é a diferença para o passo
 * anterior do mesmo workflow. "Chamar Cérebro do Cliente" fica a zero: o tempo
 * dele são os passos do Cérebro, que aparecem um a um.
 */
export function comDuracao(passos: Passo[]): Passo[] {
  const ultimo = new Map<string, number>();
  return passos.map((p) => {
    const antes = ultimo.get(p.workflow) ?? 0;
    const fim = Number(p.ms ?? 0);
    ultimo.set(p.workflow, Math.max(antes, fim));
    const ms = p.no === "Chamar Cérebro do Cliente" ? 0 : Math.max(0, fim - antes);
    return { ...p, ms };
  });
}

/** Nomes que as ferramentas têm no código, em português de gente. */
export function descreverFerramenta(nome: string) {
  const n = nome.toLowerCase().replace(/-/g, "_");
  if (n.includes("especialista")) return "Pediu ajuda ao Especialista em Serviços";
  if (n.includes("consultar_servicos")) return "Consultou o catálogo de serviços";
  if (n.includes("promoc")) return "Consultou as promoções";
  if (n.includes("info_clinica")) return "Consultou as informações da clínica";
  if (n.includes("disponibilidade")) return "Consultou a agenda";
  if (n.includes("criar_agendamento")) return "Marcou na agenda";
  if (n.includes("cancelar")) return "Cancelou a marcação";
  if (n.includes("reagendar") || n.includes("remarcar")) return "Remarcou";
  if (n.includes("agendamentos") || n.includes("consultar_agend")) return "Consultou as marcações do cliente";
  return `Usou ${nome}`;
}

/** As ações que contam para quem lê: o resto (Redis, eventos internos) fica no detalhe técnico. */
export type TipoAcaoVisivel = "mensagem" | "aviso" | "agenda" | "arquivo" | "followup" | "cancelou" | "registo";
export type AcaoVisivel = { icone: TipoAcaoVisivel; texto: string; recusada?: string };

type AcaoGravada = { tipo?: string; resumo?: string; recusada?: string };

export function acoesVisiveis(acoes: unknown): AcaoVisivel[] {
  if (!Array.isArray(acoes)) return [];
  const saida: AcaoVisivel[] = [];
  let baloes = 0;
  for (const a of acoes as AcaoGravada[]) {
    const resumo = String(a?.resumo ?? "");
    const recusada = a?.recusada;
    switch (a?.tipo) {
      case "enviar_mensagem":
        baloes += 1;
        break;
      case "aviso_equipe":
        saida.push({ icone: "aviso", texto: resumo || "Avisou a equipe", recusada });
        break;
      case "google_evento":
        saida.push({ icone: "agenda", texto: resumo || "Criou o evento na agenda", recusada });
        break;
      case "guardar_arquivo":
        saida.push({ icone: "arquivo", texto: resumo || "Guardou a mídia do cliente", recusada });
        break;
      case "gravar_tabela":
        if (/follow-up|agendamento|marca/i.test(resumo) && !/cancelar o follow-up/i.test(resumo)) {
          saida.push({ icone: /follow-up/i.test(resumo) ? "followup" : "registo", texto: legivelFollowup(resumo), recusada });
        } else if (/cancelar o follow-up/i.test(resumo)) {
          saida.push({ icone: "cancelou", texto: "Cancelou o follow-up que estava marcado (o cliente respondeu)", recusada });
        }
        break;
      default:
        break;
    }
  }
  if (baloes) saida.unshift({ icone: "mensagem", texto: `Enviou ${baloes} ${baloes === 1 ? "balão" : "balões"} ao cliente` });
  return saida;
}

/** "armar o follow-up para 2026-11-02T07:00:00.000-05:00 (etapa 1)" → "Marcou um follow-up para 02/11 às 07:00 (tentativa 1)". */
export function legivelFollowup(resumo: string) {
  const m = resumo.match(/armar o follow-up para (\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})[^ ]*(?: \(etapa (\d+)\))?/);
  if (!m) return resumo;
  return `Marcou um follow-up para ${m[3]}/${m[2]} às ${m[4]}:${m[5]}${m[6] ? ` (tentativa ${m[6]})` : ""}, caso o cliente não responda`;
}

function contar(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

function linhasDaFase(id: string, t: TurnoCompleto): string[] {
  const r = t.resumo ?? {};
  const linhas: string[] = [];
  switch (id) {
    case "entendeu":
      if (r.assunto) linhas.push(`Assunto: ${r.assunto}`);
      if (r.idioma) linhas.push(`Idioma: ${r.idioma}`);
      if (r.trava_roteamento) linhas.push(`Caminho forçado por regra: ${r.trava_roteamento}`);
      break;
    case "atendimento":
    case "agendamento":
    case "indefinido": {
      if (r.briefing?.objectivo) linhas.push(`Decidiu: ${r.briefing.objectivo}`);
      if (r.briefing?.pergunta_a_fazer) linhas.push(`Pergunta a fazer: ${r.briefing.pergunta_a_fazer}`);
      break;
    }
    case "redator": {
      const fatos = r.briefing?.factos?.length ?? 0;
      if (fatos) linhas.push(`Recebeu ${contar(fatos, "facto", "factos")} para usar (só pode dizer o que está lá)`);
      if (r.travas?.length) for (const x of r.travas) linhas.push(`Trava agiu: ${x}`);
      if (t.handoff?.necessario) linhas.push(`Chamou a equipe: ${t.handoff.motivo ?? ""}`);
      break;
    }
    case "enviou": {
      const n = Array.isArray(t.mensagens) ? t.mensagens.length : 0;
      if (n) linhas.push(`${contar(n, "balão", "balões")}${t.modo === "sombra" ? " (sombra: não enviados)" : ""}`);
      break;
    }
    default:
      break;
  }
  return linhas;
}

/**
 * O desenho do turno. `null` quando não há passos gravados (por exemplo um
 * contacto bloqueado, que não guarda nada por privacidade).
 */
export function montarFluxo(t: TurnoCompleto): LinhaFluxo[] | null {
  const passos = comDuracao(t.passos ?? []);
  const moldes = moldesDe(t);
  if (!passos.length) return null;

  if (!moldes) {
    // Lembretes e outros: uma fase por workflow, na ordem em que correram.
    const porWf = new Map<string, Passo[]>();
    for (const p of passos) porWf.set(p.workflow, [...(porWf.get(p.workflow) ?? []), p]);
    const fases = [...porWf.entries()].map(([wf, ps]) => ({
      id: wf, titulo: wf === "lembretes" ? "Lembrete da consulta" : wf, explica: "", estado: "feito" as EstadoFase,
      linhas: [], passos: ps, ferramentas: [], ms: ps.reduce((s, p) => s + (p.ms ?? 0), 0),
    }));
    marcarFim(fases, t.estado, t.erro ?? t.motivo);
    return fases.map((fase) => ({ tipo: "fase", fase }));
  }

  const porFase = new Map<string, Passo[]>();
  const deFerramentas: Passo[] = [];
  let atual = moldes[0].id;
  for (const p of passos) {
    const fase = faseDoPasso(moldes, p);
    // Sub-workflows chamados como ferramenta (agenda, marcação) pertencem ao caminho escolhido.
    if (!fase && !["omnichannel", "cerebro", "followup"].includes(p.workflow)) {
      deFerramentas.push(p);
      continue;
    }
    atual = fase ?? atual;
    porFase.set(atual, [...(porFase.get(atual) ?? []), p]);
  }
  if (deFerramentas.length) {
    const ramo = moldes.find((m) => m.ramo && porFase.has(m.id))?.id ?? moldes.find((m) => m.ramo)?.id ?? atual;
    porFase.set(ramo, [...(porFase.get(ramo) ?? []), ...deFerramentas]);
  }

  const ferramentas = t.ferramentas ?? [];
  const fases = moldes.map<Fase>((m) => {
    const ps = porFase.get(m.id) ?? [];
    return {
      id: m.id, titulo: m.titulo, explica: m.explica, estado: ps.length ? "feito" : "nao_usado",
      linhas: ps.length ? linhasDaFase(m.id, t) : [], passos: ps,
      ferramentas: ps.length && m.ramo ? ferramentas.map((f) => ({ ...f, titulo: descreverFerramenta(f.nome) })) : [],
      ms: ps.reduce((s, p) => s + (p.ms ?? 0), 0),
    };
  });
  // O envio do follow-up é feito pelo código e não deixa passo: conta a ação.
  const enviou = fases.find((f) => f.id === "fu_enviou");
  if (enviou && enviou.estado === "nao_usado" && acoesVisiveis(t.resumo?.acoes).some((a) => a.icone === "mensagem")) {
    enviou.estado = "feito";
  }
  marcarFim(fases, t.estado, t.erro ?? t.motivo);

  const linhas: LinhaFluxo[] = [];
  moldes.forEach((m, i) => {
    if (!m.ramo) return void linhas.push({ tipo: "fase", fase: fases[i] });
    const ultima = linhas[linhas.length - 1];
    if (ultima?.tipo === "ramo" && ultima.titulo === m.ramo) ultima.fases.push(fases[i]);
    else linhas.push({ tipo: "ramo", titulo: m.ramo, fases: [fases[i]] });
  });
  return linhas;
}

/** Num turno que parou ou deu erro, a última fase que correu fica a amarelo ou a vermelho. */
function marcarFim(fases: Fase[], estado: string, motivo: string | null) {
  if (estado !== "parado" && estado !== "erro") return;
  for (let i = fases.length - 1; i >= 0; i--) {
    if (fases[i].estado === "feito") {
      fases[i].estado = estado === "erro" ? "erro" : "parou";
      if (motivo) fases[i].linhas.push(`${estado === "erro" ? "Erro" : "Parou aqui"}: ${motivo}`);
      return;
    }
  }
}

/** "há 3 min", "há 2 h", "há 4 dias". */
export function haQuanto(iso: string, agora = Date.now()) {
  const s = Math.max(0, Math.round((agora - Date.parse(iso)) / 1000));
  if (s < 60) return "agora mesmo";
  const min = Math.round(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** Início da janela das métricas "últimas 24 h" (a página é renderizada no servidor a cada pedido). */
export function inicioUltimas24h(agora = Date.now()) {
  return agora - 24 * 3600_000;
}

/** Atividade nas últimas `horas` (o ponto verde do cabeçalho). */
export function ativoHa(iso: string | null, horas = 2, agora = Date.now()) {
  return Boolean(iso) && agora - Date.parse(iso as string) <= horas * 3600_000;
}
