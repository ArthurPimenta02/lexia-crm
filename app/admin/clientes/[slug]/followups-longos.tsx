import { FollowupsLongosInterruptor } from "@/app/admin/clientes/[slug]/followups-longos-interruptor";
import { getT } from "@/lib/i18n/servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerFilaDosLongos } from "@/lib/temperatura/leitura";

const CLIENTES_COM_LONGOS = ["miranda_skin_experts", "detail_by_cordeiro"];

/**
 * Follow-ups de 3 e 7 dias (14/11/2026): interruptor por cliente e a fila do
 * que está agendado. Lido com a service role (tela só do admin), sempre
 * filtrado pelo slug. Sem a coluna na base, avisa em vez de partir a página.
 */
export async function FollowupsLongosBloco({ clienteSlug, timeZone, locale }: { clienteSlug: string; timeZone: string; locale: string }) {
  if (!CLIENTES_COM_LONGOS.includes(clienteSlug)) return null;
  const t = await getT();

  let ligado = false;
  let semColuna = false;
  let fila: Awaited<ReturnType<typeof lerFilaDosLongos>>["fila"] = [];
  try {
    const admin = createAdminClient();
    const cfg = await admin.from("lexia_clientes").select("followups_longos").eq("slug", clienteSlug).maybeSingle();
    if (cfg.error) semColuna = true;
    else ligado = (cfg.data as { followups_longos?: boolean } | null)?.followups_longos === true;
    fila = (await lerFilaDosLongos(admin, clienteSlug)).fila;
  } catch {
    semColuna = true;
  }

  const quando = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone }).format(new Date(iso));
  const nomes = { quente: t("Quente"), morno: t("Morno"), frio: t("Frio") };

  return (
    <section className="ds-bloco min-w-0 overflow-hidden">
      <div className="flex min-h-14 flex-wrap items-center gap-2 px-5 pt-4 pb-2">
        <h2 className="ds-titulo-3 min-w-0 flex-1 text-foreground">
          {t("Follow-ups de 3 e 7 dias")}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {fila.length === 1 ? t("1 agendado") : t("{n} agendados", { n: fila.length })}
          </span>
        </h2>
        {semColuna ? null : <FollowupsLongosInterruptor clienteSlug={clienteSlug} ligado={ligado} />}
      </div>
      <div className="px-5 pb-5 text-sm">
        <p className="text-muted-foreground">
          {t("Lead frio: 1 h e 24 h. Morno: + 7 dias. Quente: + 3 e 7 dias. Só pelo WhatsApp, até 10 por dia, com 6 a 12 minutos entre envios, de segunda a sábado das 10h às 18h.")}
        </p>
        {semColuna ? (
          <p className="mt-3 text-[var(--ds-perigo)]">
            {t("Falta criar a coluna followups_longos em lexia_clientes (migração 202611140017). Enquanto não existir, os agentes tratam os follow-ups longos como desligados.")}
          </p>
        ) : null}
        {fila.length ? (
          <ul className="mt-3 divide-y divide-border">
            {fila.slice(0, 30).map((f) => (
              <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2" key={`${f.conversa}:${f.quando}`}>
                <span className="tabular-nums text-foreground">{quando(f.quando)}</span>
                <span className="text-muted-foreground">{f.etapa === 3 ? t("3 dias") : t("7 dias")}</span>
                {f.temperatura ? <span className="ds-selo ds-selo-neutro">{nomes[f.temperatura]}</span> : null}
                <a className="min-w-0 flex-1 truncate underline-offset-2 hover:underline" href={`/admin/conversas?cliente=${clienteSlug}&conversa=${encodeURIComponent(f.conversa)}`}>
                  {f.motivo || f.conversa}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
