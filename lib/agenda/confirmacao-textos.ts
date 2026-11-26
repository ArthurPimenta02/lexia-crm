/**
 * Os textos de confirmação de marcação de CADA agente, copiados tal e qual
 * (25/11/2026). O Arthur: "tem que ser tudo a mesma coisa" — quando a equipe
 * marca pelo app, a cliente recebe exatamente a mensagem que receberia se o
 * agente tivesse marcado.
 *
 * Fontes (VPS, 25/11):
 * - Miranda: nó "Montar Confirmação" de snapshot/criar_agendamento.json;
 * - Claudia: textoConfirmacao em cerebro/marcar.ts (+ quando, pessoa, MORADA, preparo, nomeNoIdioma);
 * - Detail: textoConfirmacao em raiz/turno.ts (+ rotuloDe, nomeNatural, sinalDe: 40% a partir de 70€).
 * Se um destes mudar no agente, mudar aqui também (teste: tests/confirmacao-textos.test.mts).
 *
 * Sem dependências de servidor: é só texto, testável sem base.
 */

import { getClientTimezone } from "@/lib/clientes/timezone";

export type Idioma = "pt" | "en" | "es";

/** Partes de um instante num fuso, com o Intl (o mesmo que o luxon dos agentes faz). */
function partes(iso: string, timeZone: string, locale: string, opcoes: Intl.DateTimeFormatOptions) {
  const p = new Intl.DateTimeFormat(locale, { timeZone, ...opcoes }).formatToParts(new Date(iso));
  return Object.fromEntries(p.map((x) => [x.type, x.value])) as Record<string, string>;
}
const ddMM = (iso: string, tz: string) => { const p = partes(iso, tz, "en-GB", { day: "2-digit", month: "2-digit" }); return `${p.day}/${p.month}`; };
/** "h:mm a" do luxon em en-US: "10:00 AM", "2:30 PM". */
const horaAmericana = (iso: string, tz: string) => { const p = partes(iso, tz, "en-US", { hour: "numeric", hour12: true, minute: "2-digit" }); return `${p.hour}:${p.minute} ${p.dayPeriod}`; };
const hhmm = (iso: string, tz: string) => { const p = partes(iso, tz, "en-GB", { hour: "2-digit", hour12: false, minute: "2-digit" }); return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`; };
const SEMANA = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** 1 = segunda … 7 = domingo, no fuso (o `weekday` do luxon). */
const diaDaSemana = (iso: string, tz: string) => SEMANA.indexOf(partes(iso, tz, "en-US", { weekday: "short" }).weekday) + 1;
const primeiroNome = (nome: string) => nome.split(" ")[0];

// ---------------------------------------------------------------- Miranda
const TZ_MIRANDA = getClientTimezone("miranda_skin_experts");
const DIAS_MIRANDA: Record<Idioma, string[]> = {
  pt: ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  es: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
};

export function confirmacaoMiranda(a: { idioma: Idioma; inicio: string; nome: string; profissional: string; servico: string; servicoEn?: string | null; servicoEs?: string | null }): string {
  const nomeServico = a.idioma === "en" ? (a.servicoEn || a.servico) : a.idioma === "es" ? (a.servicoEs || a.servico) : a.servico;
  const dia = DIAS_MIRANDA[a.idioma][diaDaSemana(a.inicio, TZ_MIRANDA) - 1];
  const data = ddMM(a.inicio, TZ_MIRANDA);
  const hora = horaAmericana(a.inicio, TZ_MIRANDA);
  const n = primeiroNome(a.nome);
  const textos: Record<Idioma, string> = {
    pt: `✨ Agendamento confirmado, ${n}!\n\n📅 ${dia}, ${data}\n🕒 ${hora}\n💆 ${nomeServico} com ${a.profissional}\n📍 469 Salem St., Suite 71. Medford, MA 02155\n(Dentro do Sola Salons: ao entrar, vire à direita, estúdio 4)\n\nQualquer imprevisto, é só nos avisar por aqui.`,
    en: `✨ Appointment confirmed, ${n}!\n\n📅 ${dia}, ${data}\n🕒 ${hora}\n💆 ${nomeServico} with ${a.profissional}\n📍 469 Salem St., Suite 71. Medford, MA 02155\n(Inside Sola Salons: walk in, turn right, studio 4)\n\nIf anything comes up, just message us here.`,
    es: `✨ ¡Cita confirmada, ${n}!\n\n📅 ${dia}, ${data}\n🕒 ${hora}\n💆 ${nomeServico} con ${a.profissional}\n📍 469 Salem St., Suite 71. Medford, MA 02155\n(Dentro de Sola Salons: al entrar, gira a la derecha, estudio 4)\n\nCualquier imprevisto, avísanos por aquí.`,
  };
  const normServ = (a.servico || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const ehLaser = normServ.includes("depilacao a laser") || normServ.includes("laser hair removal");
  const orientacoes: Record<Idioma, string> = {
    pt: `\n\n📝 Preparo para a sua sessão:\n• Raspe a área com lâmina de 12 a 24 horas antes (não use cera nem pinça)\n• Evite sol e bronzeamento na área nos 7 dias anteriores\n• Suspenda ácidos e esfoliantes na região de 3 a 5 dias antes\n• Venha com a pele limpa, sem cremes, desodorante ou maquiagem na área\n• Se estiver usando algum medicamento, nos avise por aqui`,
    en: `\n\n📝 Getting ready for your session:\n• Shave the area with a razor 12 to 24 hours before (no waxing or tweezing)\n• Avoid sun and tanning on the area for the 7 days prior\n• Stop using acids and exfoliants on the area 3 to 5 days before\n• Come with clean skin — no creams, deodorant or makeup on the area\n• If you're taking any medication, let us know here`,
    es: `\n\n📝 Preparación para tu sesión:\n• Rasura el área con cuchilla de 12 a 24 horas antes (no uses cera ni pinza)\n• Evita el sol y el bronceado en el área los 7 días previos\n• Suspende ácidos y exfoliantes en la zona de 3 a 5 días antes\n• Ven con la piel limpia, sin cremas, desodorante ni maquillaje en el área\n• Si estás tomando algún medicamento, avísanos por aquí`,
  };
  let confirmacao = textos[a.idioma] || textos.pt;
  if (ehLaser) confirmacao += orientacoes[a.idioma] || orientacoes.pt;
  return confirmacao;
}

// ---------------------------------------------------------------- Claudia
const TZ_CLAUDIA = getClientTimezone("claudia_leite_spa");
const MORADA_CLAUDIA: Record<Idioma, string> = {
  pt: "10 Holden St, Malden, MA. Tem estacionamento ao lado da High School.",
  en: "10 Holden St, Malden, MA. There is parking next to the High School.",
  es: "10 Holden St, Malden, MA. Hay estacionamiento al lado de la High School.",
};
const NOMES_CLAUDIA: Record<string, string> = { claudia: "Claudia", jessica: "Jessica", priscilla: "Priscilla", suellen: "Suellen" };
const EM_PT: [RegExp, string][] = [
  [/under arms/i, "axila"], [/brazilian bikini|full brazilian/i, "virilha cavada"], [/bikini( line| \(only\))?/i, "virilha"], [/full legs?/i, "perna inteira"],
  [/half legs?|halp legs/i, "meia perna"], [/brazilian/i, "virilha cavada"], [/legs upper/i, "coxa"], [/legs lower/i, "canela"], [/upper lip/i, "buço"], [/\blips?\b/i, "buço/lábio"],
  [/chin/i, "queixo"], [/full face/i, "rosto"], [/half beard/i, "meia barba"], [/beard/i, "barba"], [/side burns/i, "costeleta"], [/full arms/i, "braço inteiro"],
  [/lower arms/i, "antebraço e mãos"], [/lower back/i, "lombar"], [/full back/i, "costas"], [/back/i, "costas"], [/belly botton/i, "umbigo"], [/bally|belly/i, "barriga"],
  [/chest/i, "peito"], [/breasts/i, "seios"], [/tattoo/i, "tatuagem"], [/full body/i, "corpo inteiro"],
];
const EM_ES: [RegExp, string][] = [
  [/under arms/i, "axila"], [/brazilian bikini|full brazilian/i, "bikini brasileño"], [/bikini( line| \(only\))?/i, "línea de bikini"], [/full legs?/i, "pierna completa"],
  [/half legs?|halp legs/i, "media pierna"], [/brazilian/i, "bikini brasileño"], [/legs upper/i, "muslo"], [/legs lower/i, "pantorrilla"], [/upper lip/i, "bozo"], [/\blips?\b/i, "labio"],
  [/chin/i, "mentón"], [/full face/i, "rostro"], [/half beard/i, "media barba"], [/beard/i, "barba"], [/side burns/i, "patillas"], [/full arms/i, "brazo completo"],
  [/lower arms/i, "antebrazo y manos"], [/lower back/i, "zona lumbar"], [/full back/i, "espalda"], [/back/i, "espalda"], [/belly botton/i, "ombligo"], [/bally|belly/i, "abdomen"],
  [/chest/i, "pecho"], [/breasts/i, "senos"], [/tattoo/i, "tatuaje"], [/full body/i, "cuerpo completo"],
];
export type ServicoClaudia = { categoria: string; nome: string; nome_en?: string | null; nome_es?: string | null };

export function nomeNoIdiomaClaudia(s: ServicoClaudia, idioma: Idioma): string {
  if (idioma !== "en" && /^(ipl_|cera)/.test(s.categoria)) {
    const mapa = idioma === "es" ? EM_ES : EM_PT;
    const p = s.nome.split("+").map((x) => mapa.find(([re]) => re.test(x))?.[1]).filter(Boolean);
    if (p.length === s.nome.split("+").length) {
      const tipo = /^ipl_/.test(s.categoria) ? (idioma === "es" ? "Depilación láser" : "Depilação a laser") : (idioma === "es" ? "Depilación con cera" : "Depilação com cera");
      return `${tipo} de ${p.join(" + ")}`;
    }
  }
  return (idioma === "en" ? s.nome_en : idioma === "es" ? s.nome_es : null) || s.nome;
}
const quandoClaudia = (iso: string, idioma: Idioma) => {
  if (idioma === "en") {
    const p = partes(iso, TZ_CLAUDIA, "en-US", { day: "numeric", month: "short", weekday: "long" });
    return `${p.weekday}, ${p.month} ${p.day} at ${horaAmericana(iso, TZ_CLAUDIA)}`;
  }
  const sem = partes(iso, TZ_CLAUDIA, idioma === "es" ? "es" : "pt-BR", { weekday: "long" }).weekday;
  return `${sem}, ${ddMM(iso, TZ_CLAUDIA)} ${idioma === "es" ? "a las" : "às"} ${horaAmericana(iso, TZ_CLAUDIA)}`;
};
const pessoaClaudia = (p: string, i: Idioma) => (p === "priscilla" ? (i === "en" ? "Nurse Priscilla" : i === "es" ? "la enfermera Priscilla" : "a enfermeira Priscilla") : `${i === "pt" ? "a " : ""}${NOMES_CLAUDIA[p] ?? p}`);

export function confirmacaoClaudia(a: { avaliacao: boolean; idioma: Idioma; inicio: string; nome: string; profissional: string; servico: ServicoClaudia }): string {
  const { idioma } = a;
  const n = a.nome.split(/\s+/)[0];
  const nome = a.avaliacao ? `${idioma === "en" ? "Consultation for" : idioma === "es" ? "Evaluación de" : "Avaliação de"} ${nomeNoIdiomaClaudia(a.servico, idioma)}` : nomeNoIdiomaClaudia(a.servico, idioma);
  const linha = `• ${nome}, ${quandoClaudia(a.inicio, idioma)} ${idioma === "en" ? "with" : idioma === "es" ? "con" : "com"} ${pessoaClaudia(a.profissional.toLowerCase(), idioma)}`;
  const abre = idioma === "en" ? `All set, ${n}! Your appointment is booked ✅` : idioma === "es" ? `¡Listo, ${n}! Tu cita está agendada ✅` : `Prontinho, ${n}! Seu horário está marcado ✅`;
  const onde = `📍 ${MORADA_CLAUDIA[idioma]}`;
  const fecha = idioma === "en" ? "If you need to reschedule or cancel, just let me know here." : idioma === "es" ? "Si necesitas cambiar o cancelar, solo avísame aquí." : "Se precisar remarcar ou cancelar, é só me avisar aqui.";
  const preparo = /^ipl_/.test(a.servico.categoria) ? [idioma === "en" ? "Please come with the area shaved." : idioma === "es" ? "Ven con el área rasurada." : "Venha com a área raspada."] : [];
  return [abre, "", linha, onde, ...preparo, "", fecha].join("\n");
}

// ---------------------------------------------------------------- Detail
const TZ_DETAIL = getClientTimezone("detail_by_cordeiro");
const NOMES_DIAS_DETAIL = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
export const nomeNaturalDetail = (nome: string) => String(nome || "").replace(/^\s*lavagem\s*-\s*/i, "").trim();
export const sinalDetail = (valor: number | null, avaliacao: boolean) => (avaliacao || valor == null || valor < 70 ? null : Math.round(valor * 0.4));
const rotuloDetail = (iso: string) => `${NOMES_DIAS_DETAIL[diaDaSemana(iso, TZ_DETAIL) - 1]}, ${ddMM(iso, TZ_DETAIL)} às ${hhmm(iso, TZ_DETAIL)}`;

export function confirmacaoDetail(a: { avaliacao: boolean; carro: string | null; info: Record<string, string>; inicio: string; nome: string; servico: string; valor: number | null }): string {
  const sinal = sinalDetail(a.valor, a.avaliacao);
  // O agente escreve sempre o carro; numa marcação da equipe sem carro escrito a linha sai (não se inventa).
  let t = `A tua marcação está registada ✅\n\n📋 ${nomeNaturalDetail(a.servico)}${a.avaliacao ? " (avaliação presencial, ~15 min)" : ""}${a.carro ? `\n🚗 ${a.carro}` : ""}\n📅 ${rotuloDetail(a.inicio)}\n👤 ${a.nome}`;
  const mb = a.info.sinal_mbway_numero, iban = a.info.sinal_iban, tit = a.info.sinal_iban_titular;
  if (sinal != null && (mb || iban)) {
    const l = [...(mb ? [`📲 MB WAY — ${mb}`] : []), ...(iban ? [`🏦 Transferência — ${iban}` + (tit && !/^PREENCHER/i.test(tit) ? `\n     em nome de ${tit}` : "")] : [])];
    t += `\n\nFalta só o sinal de ${sinal}€ para a marcação ficar confirmada (são 40% do valor do serviço; o resto pagas no dia).\n\n${l.join("\n")}\n\nDepois é só enviares o comprovativo aqui mesmo nesta conversa 👍`;
  } else if (sinal != null) t += `\n\nFalta só o sinal de ${sinal}€ para ficar confirmada. O Martim passa-te já os dados de pagamento 👍`;
  else t += `\n\nEstá confirmada! Se precisares de alterar alguma coisa, é só dizer por aqui.`;
  return t;
}
