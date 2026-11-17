// Prova com IA de verdade (chave da Jessica): os textos que a Lexia escreve para os serviços dela. NÃO grava nada.
import { writeFileSync } from "node:fs";
import { createAdminClient } from "../lib/supabase/admin";
import { lerItens, lerOnboarding } from "../lib/onboarding/dados";
import { chaveDoCliente, custoUsd } from "../lib/onboarding/ia";
import { juntarTextos, pedirTextosDosServicos, servicosParaEscrever, type ItemNovo } from "../lib/onboarding/fontes";

const admin = createAdminClient(), S = "jessica_beauty";
const onb = (await lerOnboarding(admin, S))!;
const { data } = await admin.from("lexia_onboarding_campos").select("campo,item_id,valor,estado,fonte").eq("cliente_slug", S).eq("onboarding_id", onb.id).eq("estado", "rascunho");
const ativos = (await lerItens(admin, S, onb.id)).filter((i) => !i.removido && i.grupo === "servicos").sort((a, b) => a.ordem - b.ordem);
const itens: ItemNovo[] = ativos.map((i) => {
  const ls = (data as { campo: string; item_id: string | null; valor: unknown; fonte: string }[]).filter((l) => l.item_id === i.id);
  return { grupo: "servicos", nome: String(ls.find((l) => l.campo === "nome")?.valor ?? ""), linhas: ls.map((l) => ({ campo: l.campo, valor: l.valor, estado: "rascunho" as const, fonte: l.fonte as never })) };
});
const pedido = servicosParaEscrever(itens);
const t0 = Date.now();
const r = await pedirTextosDosServicos((await chaveDoCliente(admin, S))!, { tipoDeNegocio: onb.etapa1.tipo_de_negocio ?? "", servicos: pedido });
console.log(`tipo de negócio: ${onb.etapa1.tipo_de_negocio} | ${pedido.length} serviços | ${Date.now() - t0} ms | custo US$ ${custoUsd(r.uso).toFixed(4)} | uso ${JSON.stringify(r.uso)}`);
const juntos = juntarTextos(itens, r.textos);
writeFileSync(process.argv[2], JSON.stringify(juntos, null, 1));
for (const [n, item] of juntos.entries()) {
  console.log(`\n## ${item.nome}  (das fontes: ${itens[n].linhas.map((l) => l.campo).join(", ")})`);
  for (const l of item.linhas.filter((l) => l.fonte === "recomendacao")) console.log(`  [${l.campo}] ${l.valor}`);
}
