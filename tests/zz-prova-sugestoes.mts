// Prova com IA de verdade (chave da Jessica): perguntas frequentes e objeções sugeridas. NÃO grava nada.
import { writeFileSync } from "node:fs";
import { createAdminClient } from "../lib/supabase/admin";
import { lerItens, lerLinhas, lerOnboarding } from "../lib/onboarding/dados";
import { chaveDoCliente, custoUsd } from "../lib/onboarding/ia";
import { juntarSugestoes, lerSite, pedirSugestoes, textoDasFontes } from "../lib/onboarding/fontes";
const admin = createAdminClient(), S = "jessica_beauty";
const onb = (await lerOnboarding(admin, S))!;
const itens = (await lerItens(admin, S, onb.id)).filter((i) => !i.removido && i.grupo === "servicos");
const ls = await lerLinhas(admin, S, onb.id);
const servicos = itens.map((i) => String(ls.find((l) => l.item_id === i.id && l.campo === "nome")?.valor ?? ""));
const site = await lerSite(onb.etapa1.site ?? "");
const t0 = Date.now();
const r = await pedirSugestoes((await chaveDoCliente(admin, S))!, { tipoDeNegocio: onb.etapa1.tipo_de_negocio ?? "", servicos, jaExistem: { faqs: [], objecoes: [] }, fontes: textoDasFontes({ etapa1: onb.etapa1, site: site.texto, arquivos: [] }) });
console.log(`${Date.now() - t0} ms | custo US$ ${custoUsd(r.uso).toFixed(4)}`);
const j = juntarSugestoes([], r.sugestoes);
writeFileSync(process.argv[2], JSON.stringify(j, null, 1));
for (const x of j) console.log(`\n[${x.grupo}] ${x.nome}\n   → ${x.linhas[1].valor}`);
