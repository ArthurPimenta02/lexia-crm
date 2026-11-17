// Prova com IA de verdade, SEM gravar: o rascunho com as fontes que estão hoje na Etapa 1 da Jessica.
import { createAdminClient } from "../lib/supabase/admin";
import { lerOnboarding, listarArquivos } from "../lib/onboarding/dados";
import { chaveDoCliente, custoUsd } from "../lib/onboarding/ia";
import { lerSite, pedirRascunho, rascunhoParaCaderno, textoDasFontes } from "../lib/onboarding/fontes";
const admin = createAdminClient(), S = "jessica_beauty";
const onb = (await lerOnboarding(admin, S))!;
const arquivos = (await listarArquivos(admin, S, onb.id)).filter((a) => a.origem === "etapa1").map((a) => ({ nome: a.nome ?? "arquivo", texto: a.texto ?? "" }));
const site = await lerSite(onb.etapa1.site ?? "");
const fontes = { etapa1: onb.etapa1, site: site.texto, arquivos };
console.log("arquivos:", arquivos.length, "| caracteres das fontes:", textoDasFontes(fontes).length);
const t0 = Date.now();
const { rascunho, uso } = await pedirRascunho((await chaveDoCliente(admin, S))!, fontes);
const { linhas, itens } = rascunhoParaCaderno(rascunho);
console.log(`${Math.round((Date.now() - t0) / 1000)} s | custo US$ ${custoUsd(uso).toFixed(4)} | uso ${JSON.stringify(uso)}`);
console.log("raiz:", linhas.length, "| itens:", Object.entries(Object.groupBy(itens, (i) => i.grupo)).map(([g, l]) => `${g} ${l!.length}`).join(", "));
console.log("serviços:", itens.filter((i) => i.grupo === "servicos").map((i) => `${i.nome}${i.linhas.find((l) => l.campo === "valor") ? " $" + i.linhas.find((l) => l.campo === "valor")!.valor : ""}`).join(" | "));
import { writeFileSync } from "node:fs";
writeFileSync("/private/tmp/claude-501/-Users-arthurpimenta/0d9d168f-a6b0-4ceb-a404-4861db56e8fa/scratchpad/jess/prova2.json", JSON.stringify({ linhas, itens }, null, 1));
