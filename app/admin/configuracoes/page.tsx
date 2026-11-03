import { PaginaCabecalho } from "@/app/components/painel-ui";
import { getT } from "@/lib/i18n/servidor";

export default async function AdminSettingsPage() {
  const t = await getT();

  return (
    <section className="flex w-full max-w-5xl flex-col gap-6">
      <PaginaCabecalho titulo={t("Configurações")} />
      <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        {t("Ainda não há nada para configurar aqui.")}
      </div>
    </section>
  );
}
