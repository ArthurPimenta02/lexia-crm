import { redirect } from "next/navigation";

import {
  criarClienteAction,
  gravarNotasAction,
  juntarClientesAction,
  separarClientesAction,
} from "@/app/app/clientes/actions";
import { ClientesPanel } from "@/app/components/clientes-panel";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientes } from "@/lib/clientes/read";
import { getServicosConfig } from "@/lib/servicos/config";

export const metadata = {
  title: "Clientes",
};

export default async function ClientesPage() {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const { clientes, deFora, historicoLigado } = await getClientes(
    profile.cliente_slug,
  );
  const moeda = getServicosConfig(profile.cliente_slug)?.moeda ?? "EUR";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
          Clientes
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Quem falou contigo, e o que já comprou
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600">
          Cada pessoa que escreveu ao agente tem aqui uma ficha. A lista está
          ordenada por quem falou mais recentemente, e entram as pessoas com
          nome e com número de telefone — é o que permite voltar a falar com
          elas.
        </p>
        <p className="mt-2 max-w-2xl text-zinc-600">
          O histórico de marcações e o total gasto vêm das marcações que o
          agente criou, ligadas à ficha pelo número de telefone.
        </p>
      </div>

      <ClientesPanel
        actionCriar={criarClienteAction}
        actionJuntar={juntarClientesAction}
        actionNotas={gravarNotasAction}
        actionSeparar={separarClientesAction}
        clientes={clientes}
        deFora={deFora}
        historicoLigado={historicoLigado}
        moeda={moeda}
        podeEditar={profile.role === "cliente_admin"}
      />
    </div>
  );
}
