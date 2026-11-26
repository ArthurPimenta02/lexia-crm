import "server-only";

import { agendaDe, agendasDe } from "@/lib/agenda/google";
import { horarioPorCliente } from "@/lib/agenda/marcar";
import { canalQuePedeNota, isCanalDeAquisicao, type CanalDeAquisicao } from "@/lib/clientes/ficha";
import { procurarPorTelefone } from "@/lib/clientes/read";
import { montarTelefone } from "@/lib/clientes/telefone";
import { getClientTimezone, indicativoDoFuso, instanteNoFuso } from "@/lib/clientes/timezone";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O "Novo agendamento" do app (25/11/2026).
 *
 * O pedido do Arthur: quem está ao telefone com o cliente escreve o nome e o
 * número e marca, sem passar por "criar cliente". Se o número já tem ficha,
 * a marcação usa essa ficha; se não tem, a ficha nasce aqui, sozinha.
 *
 * A ficha nova é de WhatsApp (`whatsapp:<número completo>`), a mesma forma em
 * que o agente as grava: quando a pessoa escrever, a conversa cai nesta ficha
 * em vez de abrir outra. É a mesma regra do "Novo cliente" do painel
 * (`criarCliente` em lib/clientes/write.ts).
 */

/**
 * O indicativo que se assume quando o número vem sem "+". Pelo fuso da empresa:
 * quem atende em Boston escreve números dos EUA, quem atende em Lisboa escreve
 * números portugueses. Um número de outro país escreve-se com "+" à frente.
 */
export function indicativoPadrao(clienteSlug: string) {
  return indicativoDoFuso(getClientTimezone(clienteSlug));
}

export type ContactoResolvido =
  | { erro: string; ok: false }
  | { contactoId: string; criado: boolean; nome: string; ok: true; telefone: string };

/**
 * A ficha onde fica a marcação: a escolhida, a que já tem este número, ou uma
 * nova. Nunca apaga nem reescreve o nome de uma ficha que já existe.
 */
export async function resolverContacto({
  clienteSlug,
  contactoId,
  nomeBruto,
  origemBruto,
  origemNotaBruto,
  telefoneBruto,
  userId,
}: {
  clienteSlug: string;
  contactoId: string;
  nomeBruto: string;
  origemBruto: string;
  origemNotaBruto: string;
  telefoneBruto: string;
  userId: string | null;
}): Promise<ContactoResolvido> {
  const base = createAdminClient();

  // 1) Escolheu uma ficha da lista. A leitura por empresa é a autorização.
  if (contactoId.trim()) {
    const { data } = await base
      .from("lexia_contactos")
      .select("id, nome, telefone")
      .eq("cliente_slug", clienteSlug)
      .eq("id", contactoId.trim())
      .maybeSingle();
    if (!data) return { erro: "Cliente não encontrado na base.", ok: false };
    return { contactoId: String(data.id), criado: false, nome: String(data.nome ?? ""), ok: true, telefone: String(data.telefone ?? "") };
  }

  const nome = nomeBruto.trim().replace(/\s+/g, " ");
  if (!nome) return { erro: "Escreva o nome do cliente.", ok: false };
  if (nome.length > 256) return { erro: "O nome é comprido demais.", ok: false };

  const { digitos, erro } = montarTelefone(indicativoPadrao(clienteSlug), telefoneBruto);
  if (erro || !digitos) return { erro: erro ?? "Telefone inválido.", ok: false };

  // 2) O número já tem ficha: usa-se essa (a de WhatsApp primeiro, e nunca uma
  //    que foi juntada a outra).
  const existentes = (await procurarPorTelefone(clienteSlug, digitos)).filter((x) => !x.fundidoEm);
  const ja = existentes.find((x) => x.identificadorConversa === `whatsapp:${digitos}`) ?? existentes[0];
  if (ja) return { contactoId: ja.id, criado: false, nome: ja.nome || nome, ok: true, telefone: ja.telefone || digitos };

  // 3) Ficha nova, com a origem se a pessoa a disse.
  let origem: CanalDeAquisicao | null = null;
  let origemNota: string | null = null;
  if (origemBruto.trim()) {
    if (!isCanalDeAquisicao(origemBruto.trim())) return { erro: "Essa origem não existe.", ok: false };
    origem = origemBruto.trim() as CanalDeAquisicao;
    if (origem === canalQuePedeNota) {
      origemNota = origemNotaBruto.trim().slice(0, 200) || null;
      if (!origemNota) return { erro: "Escreva de onde o cliente veio.", ok: false };
    }
  }

  const agora = new Date().toISOString();
  const { data: nova, error } = await base
    .from("lexia_contactos")
    .insert({
      actualizado_por: userId,
      atualizado_em: agora,
      canal: "whatsapp",
      cliente_slug: clienteSlug,
      criado_em: agora,
      identificador_conversa: `whatsapp:${digitos}`,
      nome,
      origem_manual: origem,
      origem_manual_em: origem ? agora : null,
      origem_manual_nota: origemNota,
      origem_manual_por: origem ? userId : null,
      telefone: digitos,
    })
    .select("id")
    .single();

  if (error || !nova) {
    // Corrida: outro pedido criou a mesma conversa entretanto. Usa-se essa.
    if (error?.code === "23505") {
      const { data } = await base.from("lexia_contactos").select("id, nome").eq("cliente_slug", clienteSlug).eq("identificador_conversa", `whatsapp:${digitos}`).maybeSingle();
      if (data) return { contactoId: String(data.id), criado: false, nome: String(data.nome ?? nome), ok: true, telefone: digitos };
    }
    console.error("[agendar] falha a criar a ficha", error);
    return { erro: "Não foi possível criar a ficha do cliente.", ok: false };
  }

  return { contactoId: String(nova.id), criado: true, nome, ok: true, telefone: digitos };
}

/** O horário de trabalho que se assume para quem não tem um configurado. */
const JANELA_PADRAO: [number, number] = [9, 19];
const PASSO_MINUTOS = 30;

/**
 * Os inícios livres de um profissional num dia, de meia em meia hora, para um
 * serviço de `duracaoMinutos`. Lê o espelho da agenda (lexia_agendamentos, que
 * a VPS refresca de 2 em 2 minutos); a confirmação final contra o Google
 * acontece na hora de marcar, como sempre.
 *
 * Numa agenda partilhada (Samuel e Bruna, as quatro do spa da Claudia) uma
 * marcação de um profissional não tapa o outro; o que foi posto à mão tapa todos.
 */
export async function horariosLivres({
  clienteSlug,
  dia,
  duracaoMinutos,
  executor,
}: {
  clienteSlug: string;
  dia: string;
  duracaoMinutos: number;
  executor: string;
}): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !(duracaoMinutos > 0)) return [];
  const fuso = getClientTimezone(clienteSlug);
  const calendario = agendaDe(clienteSlug, executor);
  // Sem agenda do Google ligada não há onde marcar (o Roberto, no Detail).
  if (!calendario) return [];
  const partilhada = Object.values(agendasDe(clienteSlug)).filter((c) => c === calendario).length > 1;

  const inicioDia = instanteNoFuso(dia, "00:00", fuso);
  const fimDia = instanteNoFuso(dia, "23:59", fuso);
  if (!inicioDia || !fimDia) return [];

  const consulta = createAdminClient()
    .from("lexia_agendamentos")
    .select("inicio, fim, executor, calendario_id, estado, dia_inteiro, origem")
    .eq("cliente_slug", clienteSlug)
    .neq("estado", "cancelado")
    .lt("inicio", fimDia)
    .gt("fim", inicioDia);
  const { data } = await consulta.eq("calendario_id", calendario).limit(500);

  const ocupados = (data ?? [])
    // Numa agenda partilhada, uma marcação do agente ou do painel/app é só de
    // quem a faz; um evento posto à mão no Google ("Thanksgiving", "Fechado")
    // vale para a clínica toda — o espelho dá-lhe um profissional por omissão,
    // e confiar nisso deixava marcar a outra pessoa num feriado.
    .filter((l) => !partilhada || l.origem === "manual" || !l.executor || String(l.executor).toLowerCase() === executor.toLowerCase())
    .map((l) => [Date.parse(String(l.inicio)), Date.parse(String(l.fim))] as const);

  const diaDaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay() || 7;
  const horario = horarioPorCliente[clienteSlug]?.[executor];
  const janela = horario ? horario(diaDaSemana) : JANELA_PADRAO;
  if (!janela) return [];

  const agora = Date.now();
  const livres: string[] = [];
  for (let m = janela[0] * 60; m + duracaoMinutos <= janela[1] * 60; m += PASSO_MINUTOS) {
    const hora = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const ini = instanteNoFuso(dia, hora, fuso);
    if (!ini) continue;
    const a = Date.parse(ini);
    const b = a + duracaoMinutos * 60_000;
    if (a < agora) continue;
    if (ocupados.some(([x, y]) => a < y && b > x)) continue;
    livres.push(hora);
  }
  return livres;
}
