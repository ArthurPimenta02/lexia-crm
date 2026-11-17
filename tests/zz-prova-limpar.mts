// Guarda uma cópia local de TUDO o que há do onboarding da Jessica e depois apaga do Supabase central.
import { writeFileSync } from "node:fs";
import { createAdminClient } from "../lib/supabase/admin";
const admin = createAdminClient(), S = "jessica_beauty";
const TABELAS = ["lexia_onboarding_campos", "lexia_onboarding_mensagens", "lexia_onboarding_arquivos", "lexia_onboarding_itens", "lexia_onboardings"];
const copia: Record<string, unknown[]> = {};
for (const t of TABELAS) { const { data, error } = await admin.from(t).select("*").eq("cliente_slug", S); if (error) throw new Error(`${t}: ${error.message}`); copia[t] = data ?? []; }
const { data: pasta, error: e1 } = await admin.storage.from("onboarding").list(S, { limit: 1000 });
if (e1) throw new Error(e1.message);
const ficheiros: string[] = [];
for (const p of pasta ?? []) { const { data } = await admin.storage.from("onboarding").list(`${S}/${p.name}`, { limit: 1000 }); for (const f of data ?? []) ficheiros.push(`${S}/${p.name}/${f.name}`); }
console.log("antes:", Object.entries(copia).map(([t, l]) => `${t} ${l.length}`).join(" | "), "| arquivos no bucket:", ficheiros.length);
writeFileSync(process.argv[2], JSON.stringify({ guardado_em: new Date().toISOString(), ...copia, ficheiros }, null, 1));
if (process.argv[3] !== "apagar") process.exit(0);
if (ficheiros.length) throw new Error("há arquivos no bucket: baixar antes de apagar");
for (const t of TABELAS) { const { error, count } = await admin.from(t).delete({ count: "exact" }).eq("cliente_slug", S); if (error) throw new Error(`${t}: ${error.message}`); console.log(`apagado de ${t}: ${count}`); }
for (const t of TABELAS) { const { count } = await admin.from(t).select("id", { count: "exact", head: true }).eq("cliente_slug", S); console.log(`resta em ${t}: ${count}`); }
