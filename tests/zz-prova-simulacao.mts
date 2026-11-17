// Simulação SEM IA e SEM gravar nada: percorre a entrevista inteira a partir do rascunho real da Jessica.
import { createAdminClient } from "../lib/supabase/admin";
import { lerItens, lerOnboarding } from "../lib/onboarding/dados";
import { montarCaderno, proximoPasso, type Andamento, type ItemDoCaderno, type LinhaDoCaderno } from "../lib/onboarding/caderno";
import { ESQUEMA_ONBOARDING } from "../lib/onboarding/esquema";

const admin = createAdminClient(), S = "jessica_beauty";
const onb = (await lerOnboarding(admin, S))!;
const { data } = await admin.from("lexia_onboarding_campos").select("campo,item_id,valor,estado,fonte,perguntas").eq("cliente_slug", S).eq("onboarding_id", onb.id).eq("estado", "rascunho");
const itens: ItemDoCaderno[] = await lerItens(admin, S, onb.id);
const ativos = new Set(itens.filter((i) => !i.removido).map((i) => i.id));
const base = (data as LinhaDoCaderno[]).filter((l) => !l.item_id || ativos.has(l.item_id)).filter((l) => !/^diferencial_/.test(l.campo));
// os textos que a Lexia escreveu (prova zz-prova-textos), na mesma ordem dos serviços
import { readFileSync } from "node:fs";
if (process.argv[2] && process.argv[2] !== "-") {
  const escritos = JSON.parse(readFileSync(process.argv[2], "utf8")) as { linhas: { campo: string; valor: unknown; fonte: string }[] }[];
  const servs = itens.filter((i) => !i.removido && i.grupo === "servicos").sort((a, b) => a.ordem - b.ordem);
  servs.forEach((sv, n) => { for (const l of escritos[n].linhas.filter((l) => l.fonte === "recomendacao")) base.push({ campo: l.campo, item_id: sv.id, valor: l.valor, estado: "rascunho", fonte: "recomendacao", perguntas: 0 }); });
}
console.log("rascunho:", base.length, "linhas | itens:", Object.entries(Object.groupBy(itens.filter((i) => !i.removido), (i) => i.grupo)).map(([g, l]) => `${g} ${l!.length}`).join(", "));
for (const s of ESQUEMA_ONBOARDING) for (const g of s.grupos) console.log(`grupo ${g.chave}: ${g.campos.filter((c) => c.tipo !== "upload").map((c) => `${c.chave}${c.obrigatorio ? "*" : ""}(${c.modo})`).join(" ")}`);

if (process.argv[3]) {
  const sug = JSON.parse(readFileSync(process.argv[3], "utf8")) as { grupo: "faqs" | "objecoes"; linhas: { campo: string; valor: unknown }[] }[];
  sug.forEach((x, n) => { const id = `sug-${n}`; itens.push({ id, grupo: x.grupo, ordem: n, removido: false }); for (const l of x.linhas) base.push({ campo: l.campo, item_id: id, valor: l.valor, estado: "rascunho", fonte: "recomendacao", perguntas: 0 }); });
}
function correr(novos: Record<string, number>, duasVoltas: boolean) {
  const linhas = new Map(base.map((l) => [`${l.item_id ?? ""}|${l.campo}`, { ...l }]));
  const its = itens.map((i) => ({ ...i }));
  const and: Andamento = { listas: [], gruposPerguntados: [] };
  const por = (campo: string, item: string | null, valor: unknown, estado: LinhaDoCaderno["estado"]) => linhas.set(`${item ?? ""}|${campo}`, { campo, item_id: item, valor, estado, fonte: "cliente", perguntas: 1 });
  const valorDe = (c: { campo: { opcoes?: string[]; recomendado?: string | string[] } }) => c.campo.recomendado ?? c.campo.opcoes?.[0] ?? "x";
  const passos: { tipo: string; rotulo: string; confirmar: number; cartoes: number; falar: number }[] = [];
  const meio = new Set<string>();
  for (let n = 0; n < 2000; n++) {
    const cad = montarCaderno([...linhas.values()], its);
    const p = proximoPasso(cad, its, and);
    if (p.tipo === "fim") break;
    if (p.tipo === "confirmar") { passos.push({ tipo: p.tipo, rotulo: "negócio", confirmar: p.campos.length, cartoes: 0, falar: 0 }); for (const c of p.campos) por(c.campo.chave, null, c.linha!.valor, "confirmado"); }
    else if (p.tipo === "lista") {
      const det = p.detalhes.flatMap((d) => d.campos);
      passos.push({ tipo: p.tipo, rotulo: p.grupo, confirmar: p.itens.length + det.length, cartoes: 0, falar: 0 }); and.listas.push(p.grupo);
      for (const c of det) por(c.campo.chave, c.itemId, c.linha!.valor, "confirmado");
      for (const i of p.itens) { const l = linhas.get(`${i.id}|${i.grupo === "faqs" ? "pergunta" : i.grupo === "objecoes" ? "objecao" : "nome"}`); if (l) l.estado = "confirmado"; }
    }
    else if (p.tipo === "itens") {
      passos.push({ tipo: p.tipo, rotulo: p.grupo, confirmar: 0, cartoes: 0, falar: novos[p.grupo] ?? 0 });
      and.gruposPerguntados.push(p.grupo);
      for (let k = 0; k < (novos[p.grupo] ?? 0); k++) its.push({ id: `novo-${p.grupo}-${k}`, grupo: p.grupo, ordem: k, removido: false });
      if (novos[p.grupo]) and.listas.push(p.grupo);
    } else if (p.tipo === "tabela") {
      const cs = p.linhas.flatMap((l) => l.campos);
      passos.push({ tipo: p.tipo, rotulo: p.grupo, confirmar: 0, cartoes: cs.length, falar: 0 });
      and.tabelas = [...(and.tabelas ?? []), p.grupo];
      for (const c of cs) por(c.campo.chave, c.itemId, c.campo.chave === "tipo_de_preco" ? (duasVoltas && cs.indexOf(c) % 4 === 0 ? "A partir de (preço mínimo)" : "Preço fixo") : "x", "respondido");
    } else if (p.tipo === "item") {
      const id = p.itemId;
      let faltam = p.faltam;
      if (duasVoltas && faltam.length > 3 && !meio.has(id)) { meio.add(id); faltam = faltam.slice(0, Math.ceil(faltam.length * 0.6)); }
      passos.push({ tipo: p.tipo, rotulo: `${p.grupo}`, confirmar: p.confirmar.length, cartoes: p.cartoes.length, falar: faltam.length });
      for (const c of p.confirmar) por(c.campo.chave, id, c.linha!.valor, "confirmado");
      for (const c of p.cartoes) por(c.campo.chave, id, valorDe(c), "respondido");
      for (const c of faltam) por(c.campo.chave, id, valorDe(c), "respondido");
    } else if (p.tipo === "cartoes") { passos.push({ tipo: p.tipo, rotulo: p.secao, confirmar: 0, cartoes: p.campos.length, falar: 0 }); for (const c of p.campos) por(c.campo.chave, null, valorDe(c), "respondido"); }
    else if (p.tipo === "pergunta") { passos.push({ tipo: p.tipo, rotulo: p.secao, confirmar: 0, cartoes: 0, falar: p.campos.length }); for (const c of p.campos) por(c.campo.chave, null, valorDe(c), "respondido"); }
  }
  return passos;
}
for (const [nome, novos, duas] of [["direto", { faqs: 5, objecoes: 4, promocoes: 1 }, false], ["com complementos", { faqs: 8, objecoes: 6, promocoes: 2 }, true]] as const) {
  const ps = correr(novos, duas);
  console.log(`\n### ${nome}: ${ps.length} turnos`);
  const g = Object.groupBy(ps, (p) => `${p.tipo}:${p.rotulo}`);
  for (const [k, l] of Object.entries(g)) console.log(`  ${k.padEnd(34)} turnos ${String(l!.length).padStart(3)} | confirmar ${String(l!.reduce((a, p) => a + p.confirmar, 0)).padStart(3)} | cartões ${String(l!.reduce((a, p) => a + p.cartoes, 0)).padStart(3)} | falar ${l!.reduce((a, p) => a + p.falar, 0)}`);
  const t = (k: "confirmar" | "cartoes" | "falar") => ps.reduce((a, p) => a + p[k], 0);
  console.log(`  TOTAL confirmar ${t("confirmar")} | cartões ${t("cartoes")} | falar ${t("falar")}`);
}
