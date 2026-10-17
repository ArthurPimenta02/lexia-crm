import { PaginaCabecalho } from "@/app/components/painel-ui";
import { NewClientForm } from "@/app/admin/clientes/novo/new-client-form";

export default function NewClientPage() {
  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <PaginaCabecalho titulo="Novo cliente" />

      <div className="rounded-2xl border border-border bg-surface p-5">
        <NewClientForm />
      </div>
    </section>
  );
}
