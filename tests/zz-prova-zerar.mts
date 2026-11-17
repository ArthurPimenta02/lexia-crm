// Zera a CONVERSA do onboarding de teste (mantém a Etapa 1), gera o rascunho de novo e libera a conversa.
import { createAdminClient } from "../lib/supabase/admin";
import { gravarEstado, lerItens, lerLinhas, lerOnboarding } from "../lib/onboarding/dados";
import { gerarRascunho } from "../lib/onboarding/etapa1";

const admin = createAdminClient(), S = "jessica_beauty";
const onb = (await lerOnboarding(admin, S))!;
for (const t of ["lexia_onboarding_campos", "lexia_onboarding_mensagens", "lexia_onboarding_itens"]) {
  const { error, count } = await admin.from(t).delete({ count: "exact" }).eq("cliente_slug", S).eq("onboarding_id", onb.id);
  if (error) throw new Error(`${t}: ${error.message}`);
  console.log(`apagado de ${t}: ${count}`);
}
{
  const { error } = await admin.from("lexia_onboardings").update({ cursor: {}, estado: "etapa1" }).eq("cliente_slug", S).eq("id", onb.id);
  if (error) throw new Error(error.message);
}
const t0 = Date.now();
const r = await gerarRascunho(admin, S, null);
console.log("rascunho:", JSON.stringify(r), `${Math.round((Date.now() - t0) / 1000)} s`);
if (!r.ok) process.exit(1);
const depois = (await lerOnboarding(admin, S))!;
console.log("fontes:", JSON.stringify(depois.achados?.fontes?.map((f) => `${f.titulo}: ${f.ok ? "ok" : "FALHOU"} — ${f.detalhe}`), null, 1));
const linhas = await lerLinhas(admin, S, onb.id), itens = await lerItens(admin, S, onb.id);
const serv = itens.filter((i) => !i.removido && i.grupo === "servicos");
console.log(`linhas ${linhas.length} | serviços ${serv.length} | textos da Lexia ${linhas.filter((l) => l.fonte === "recomendacao").length} | grupos: ${Object.entries(Object.groupBy(itens.filter((i) => !i.removido), (i) => i.grupo)).map(([g, l]) => `${g} ${l!.length}`).join(", ")}`);
await gravarEstado(admin, S, { estado: "conversa" });
console.log("estado:", (await lerOnboarding(admin, S))!.estado);
