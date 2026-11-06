/**
 * Enche a conta de demonstração "Demo Dev Lexia" (slug clinica_teste) com
 * dados FICTÍCIOS para o revisor da Apple (e apresentações): 10 contactos,
 * conversas com o agente, 2 clientes à espera da equipe e uma agenda para os
 * próximos 10 dias. Nomes inventados; telefones na faixa 555-01xx, que nos
 * EUA é reservada para ficção.
 *
 * As datas são relativas a AGORA: correr de novo antes de cada envio para a
 * Apple. Apaga e recria só o que este script criou (conversas `*:demo…` e
 * eventos `demo-…`), nunca outra coisa.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/demo-revisao-apple.mts
 */
import { createAdminClient } from "@/lib/supabase/admin";

const SLUG = "clinica_teste";
const FUSO = "America/New_York";
const b = createAdminClient();
const agora = Date.now();
const min = 60_000, hora = 60 * min, dia = 24 * hora;

// Meia-noite de hoje em Nova York (em ms UTC).
function inicioDoDiaNY(ms: number) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  const v = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return ms - (v("hour") * hora + v("minute") * min) - (ms % min);
}
const hoje0 = inicioDoDiaNY(agora);
const iso = (ms: number) => new Date(ms).toISOString();

type Fala = [quem: "c" | "a" | "e" | "p", texto: string, minutosAtras: number];
type Pessoa = { id: string; nome: string; tel: string | null; anuncio?: string; criadaHa: number; falas: Fala[] };

const P: Pessoa[] = [
  { id: "whatsapp:16175550101", nome: "Juliana Martins", tel: "16175550101", anuncio: "Limpeza de pele - Novembro", criadaHa: 26 * 60, falas: [
    ["c", "Oi! Vi o anúncio da limpeza de pele, quanto custa?", 26 * 60],
    ["a", "Oi, Juliana! Sou a Lia, da Demo Dev Lexia. A nossa limpeza de pele personalizada é a partir de US$ 120 e leva cerca de 1h30.", 26 * 60 - 1],
    ["a", "Me conta, o que mais te incomoda na sua pele hoje?", 26 * 60 - 1],
    ["c", "Tenho bastante cravo no nariz e a pele oleosa", 25 * 60],
    ["a", "Entendi. Para pele oleosa com cravos a limpeza ajuda bastante. Essa semana tenho bastante horário de manhã na quinta e na sexta.", 25 * 60 - 1],
    ["c", "Sexta às 10 pode ser?", 24 * 60],
    ["a", "Prontinho, Juliana! Seu horário está marcado para sexta às 10:00 com a Ana. 📍 10 Example St, Boston, MA.", 24 * 60 - 2],
    ["c", "Obrigada!!", 23 * 60],
  ] },
  { id: "instagram:9000000000000102", nome: "Fernanda Rocha", tel: null, criadaHa: 5 * 60, falas: [
    ["c", "Vocês fazem drenagem linfática?", 5 * 60],
    ["a", "Oi, Fernanda! Fazemos sim. A drenagem linfática é US$ 120 a sessão de 1 hora.", 5 * 60 - 1],
    ["c", "Tem algum pacote? Queria fazer 5 sessões", 4 * 60 + 50],
    ["a", "Os pacotes quem monta é a nossa equipe. Já passei o seu pedido para elas, que te respondem por aqui.", 4 * 60 + 49],
    ["p", "Oi? Alguém?", 35],
  ] },
  { id: "whatsapp:16175550103", nome: "Camila Souza", tel: "16175550103", criadaHa: 3 * 24 * 60, falas: [
    ["c", "Boa tarde, queria remarcar minha sobrancelha de amanhã", 3 * 24 * 60],
    ["a", "Boa tarde, Camila! Claro. Para amanhã ainda tenho às 14:00 e às 16:30. Qual fica melhor?", 3 * 24 * 60 - 1],
    ["c", "16:30", 3 * 24 * 60 - 5],
    ["a", "Feito! Sua sobrancelha passou para amanhã às 16:30 com a Bia.", 3 * 24 * 60 - 6],
  ] },
  { id: "whatsapp:16175550104", nome: "Patrícia Lima", tel: "16175550104", anuncio: "Laser - Promo axila", criadaHa: 2 * 60, falas: [
    ["c", "Oi, quero saber do laser na axila", 2 * 60],
    ["a", "Oi, Patrícia! Sou a Lia, da Demo Dev Lexia. A depilação a laser na axila é US$ 80 a sessão, e antes fazemos uma avaliação rápida de 30 minutos.", 2 * 60 - 1],
    ["c", "Dói muito?", 110],
    ["a", "Pode dar um leve desconforto, como um estalinho na pele, mas a gente vai no seu ritmo. Você já fez laser antes?", 109],
    ["c", "Nunca fiz", 100],
    ["a", "Então a avaliação é ideal para começar. Tenho horário na segunda de manhã e na terça à tarde. Que dia fica melhor para você?", 99],
  ] },
  { id: "instagram:9000000000000105", nome: "Renata Alves", tel: null, anuncio: "Limpeza de pele - Novembro", criadaHa: 2 * 24 * 60, falas: [
    ["c", "Qual o endereço de vocês?", 2 * 24 * 60],
    ["a", "Oi, Renata! Ficamos na 10 Example St, Boston, MA, com estacionamento na frente.", 2 * 24 * 60 - 1],
  ] },
  { id: "whatsapp:16175550106", nome: "Beatriz Costa", tel: "16175550106", criadaHa: 6 * 24 * 60, falas: [
    ["c", "Fiz o peeling ontem e a pele está bem vermelha e ardendo, é normal?", 70],
    ["a", "Beatriz, obrigada por avisar. Já passei para a nossa equipe com prioridade. Pode me mandar uma foto da área?", 69],
    ["p", "[foto da pele]", 60],
  ] },
  { id: "whatsapp:16175550107", nome: "Larissa Gomes", tel: "16175550107", anuncio: "Laser - Promo axila", criadaHa: 4 * 24 * 60, falas: [
    ["c", "Quero marcar a avaliação do laser", 4 * 24 * 60],
    ["a", "Oi, Larissa! Tenho quarta às 9:00 ou às 15:00 com a Ana. Qual prefere?", 4 * 24 * 60 - 1],
    ["c", "9h", 4 * 24 * 60 - 10],
    ["a", "Prontinho! Avaliação de laser na quarta às 9:00 com a Ana. Venha com a área raspada.", 4 * 24 * 60 - 11],
  ] },
  { id: "whatsapp:16175550108", nome: "Amanda Ribeiro", tel: "16175550108", criadaHa: 20 * 60, falas: [
    ["c", "Vocês aceitam Zelle?", 20 * 60],
    ["a", "Aceitamos sim, Amanda: dinheiro, cartão, Zelle e Venmo.", 20 * 60 - 1],
    ["e", "Oi Amanda, aqui é a Ana! Qualquer dúvida me chama 😊", 19 * 60],
  ] },
  { id: "instagram:9000000000000109", nome: "Gabriela Nunes", tel: null, anuncio: "Limpeza de pele - Novembro", criadaHa: 40, falas: [
    ["c", "Oi! Tem horário sábado de manhã para limpeza de pele?", 40],
    ["a", "Oi, Gabriela! Tenho sim, sábado às 9:00 ou às 11:00 com a Ana. Algum desses funciona para você?", 39],
  ] },
  { id: "whatsapp:16175550110", nome: "Vanessa Pereira", tel: "16175550110", criadaHa: 5 * 24 * 60, falas: [
    ["c", "Bom dia! Quanto custa o microagulhamento?", 5 * 24 * 60],
    ["a", "Bom dia, Vanessa! O microagulhamento é US$ 280, com avaliação antes. O valor da avaliação vira crédito no tratamento.", 5 * 24 * 60 - 1],
    ["c", "Vou pensar e te falo", 5 * 24 * 60 - 30],
    ["a", "Claro, fique à vontade. Se tiver alguma dúvida sobre o procedimento, estou por aqui.", 5 * 24 * 60 - 31],
  ] },
];

// Agenda: [dias a partir de hoje, hora NY, minutos de duração, serviço, profissional, cliente, origem]
const AG: [number, number, number, string, string, string, "agente" | "manual"][] = [
  [0, 9, 90, "Limpeza de pele", "ana", "Juliana Martins", "agente"],
  [0, 11, 60, "Drenagem linfática", "ana", "Mariana Teixeira", "manual"],
  [0, 14, 30, "Design de sobrancelha", "bia", "Paula Freitas", "agente"],
  [0, 16, 60, "Massagem modeladora", "ana", "Carolina Dias", "agente"],
  [1, 10, 30, "Avaliação de laser", "ana", "Patrícia Lima", "agente"],
  [1, 16.5, 45, "Sobrancelha com henna", "bia", "Camila Souza", "agente"],
  [2, 9, 30, "Avaliação de laser", "ana", "Larissa Gomes", "agente"],
  [2, 13, 90, "Limpeza de pele", "ana", "Aline Moreira", "manual"],
  [3, 10, 60, "Drenagem linfática", "ana", "Tatiane Barros", "agente"],
  [4, 9, 90, "Limpeza de pele", "ana", "Gabriela Nunes", "agente"],
  [5, 11, 60, "Massagem modeladora", "ana", "Priscila Mendes", "agente"],
  [6, 15, 30, "Design de sobrancelha", "bia", "Roberta Lopes", "manual"],
  [8, 10, 75, "Microagulhamento", "ana", "Vanessa Pereira", "agente"],
  [9, 14, 60, "Drenagem linfática", "ana", "Fernanda Rocha", "agente"],
];

async function main() {
  const { data: cli } = await b.from("lexia_clientes").select("slug, nome").eq("slug", SLUG).maybeSingle();
  if (!cli) throw new Error("cliente demo não existe");

  // Limpa só o que é deste script.
  const ids = P.map((p) => p.id);
  await b.from("lexia_mensagens").delete().eq("cliente_slug", SLUG).in("identificador_conversa", ids);
  await b.from("lexia_contactos").delete().eq("cliente_slug", SLUG).in("identificador_conversa", ids);
  await b.from("lexia_agendamentos").delete().eq("cliente_slug", SLUG).like("event_id", "demo-%");

  for (const p of P) {
    const { data: c, error } = await b.from("lexia_contactos").insert({
      cliente_slug: SLUG, nome: p.nome, telefone: p.tel ? `+${p.tel}` : null,
      canal: p.id.split(":")[0], identificador_conversa: p.id, criado_em: iso(agora - p.criadaHa * min),
      origem_tipo: p.anuncio ? (p.id.startsWith("instagram") ? "instagram_ad" : "ctwa") : "organico", origem_titulo: p.anuncio ?? null,
    }).select("id").single();
    if (error || !c) throw new Error(`contacto ${p.nome}: ${error?.message}`);
    const linhas = p.falas.map(([quem, texto, atras]) => ({
      cliente_slug: SLUG, contacto_id: c.id, identificador_conversa: p.id, tipo: "texto", conteudo: texto,
      direccao: quem === "c" || quem === "p" ? "recebida" : "enviada",
      origem: quem === "p" ? "recebida_na_pausa" : quem === "e" ? "humano" : "workflow",
      criado_em: iso(agora - atras * min),
    }));
    const { error: e2 } = await b.from("lexia_mensagens").insert(linhas);
    if (e2) throw new Error(`mensagens ${p.nome}: ${e2.message}`);
  }

  const ag = AG.map(([d, h, dur, servico, prof, nome, origem], k) => {
    const inicio = hoje0 + d * dia + h * hora;
    const p = P.find((x) => x.nome === nome);
    return {
      cliente_slug: SLUG, calendario_id: `demo-${prof}@demo.uselexia.app`, event_id: `demo-${k + 1}`,
      inicio: iso(inicio), fim: iso(inicio + dur * min), dia_inteiro: false, fuso: FUSO,
      titulo: `${servico} — ${nome}`, estado: "confirmado", nome_cliente: nome, servico, origem,
      executor: prof, telefone: p?.tel ? `+${p.tel}` : null,
      criado_no_google: iso(agora - (k % 6 + 1) * 11 * hora), actualizado_no_google: iso(agora - (k % 6 + 1) * 11 * hora),
      sincronizado_em: iso(agora), dados: { demo: true },
    };
  });
  const { error: e3 } = await b.from("lexia_agendamentos").insert(ag);
  if (e3) throw new Error(`agenda: ${e3.message}`);

  console.log(`Demo pronta: ${P.length} contactos, ${P.reduce((s, p) => s + p.falas.length, 0)} mensagens, ${ag.length} agendamentos.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
