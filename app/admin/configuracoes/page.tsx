import { PaginaCabecalho } from "@/app/components/painel-ui";

export default function AdminSettingsPage() {
  return (
    <section className="flex w-full max-w-5xl flex-col gap-6">
      <PaginaCabecalho titulo="Configurações" />
      <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        Ainda não há nada para configurar aqui.
      </div>
    </section>
  );
}
