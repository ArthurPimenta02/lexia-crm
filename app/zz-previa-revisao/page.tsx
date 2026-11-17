// TEMPORÁRIO (fora do repositório): a revisão e a tela de depois do envio, com os dados reais da Jessica, sem login e sem gravar.
import { AgenteEmTreino, RevisaoOnboarding } from "@/app/components/onboarding/revisao";
import { fichaDe } from "@/lib/onboarding/revisao";
import { createAdminClient } from "@/lib/supabase/admin";

async function nada() {
  "use server";
  return { ok: false, erro: "Prévia: nada é gravado." };
}

export default async function Previa({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const ficha = await fichaDe({ admin: createAdminClient(), clienteSlug: "jessica_beauty" });
  const v = (await searchParams).v;
  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">{v === "treino" ? <AgenteEmTreino ficha={ficha} whatsapp="https://chat.whatsapp.com/exemplo" /> : <RevisaoOnboarding enviar={nada} ficha={ficha} salvar={nada} />}</main>;
}
