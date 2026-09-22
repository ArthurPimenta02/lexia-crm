import { NewClientForm } from "@/app/admin/clientes/novo/new-client-form";

export default function NewClientPage() {
  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Novo cliente</h1>
        <p className="mt-2 text-zinc-600">
          Cadastre um cliente e, se necessário, o workflow inicial.
        </p>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-5">
        <NewClientForm />
      </div>
    </section>
  );
}
