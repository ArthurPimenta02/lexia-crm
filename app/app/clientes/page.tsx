import { redirect } from "next/navigation";

import {
  criarClienteAction,
  gravarFichaAction,
  juntarClientesAction,
  registarServicoAction,
  separarClientesAction,
} from "@/app/app/clientes/actions";
import { ClientesPanel } from "@/app/components/clientes-panel";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { mostraViatura } from "@/lib/clientes/ficha";
import { getClientes } from "@/lib/clientes/read";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { getServicosConfig } from "@/lib/servicos/config";
import { getServicosSimples } from "@/lib/servicos/read";

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

  exigirEcra(profile.cliente_slug, "/app/clientes");

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const [{ clientes, deFora, historicoLigado }, servicos] = await Promise.all([
    getClientes(profile.cliente_slug),
    getServicosSimples(profile.cliente_slug),
  ]);
  const config = getServicosConfig(profile.cliente_slug);
  const moeda = config?.moeda ?? "EUR";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PaginaCabecalho titulo="Clientes" />

      <ClientesPanel
        actionCriar={criarClienteAction}
        actionJuntar={juntarClientesAction}
        actionFicha={gravarFichaAction}
        actionSeparar={separarClientesAction}
        actionServico={registarServicoAction}
        clientes={clientes}
        deFora={deFora}
        historicoLigado={historicoLigado}
        moeda={moeda}
        mostrarViatura={mostraViatura(profile.cliente_slug)}
        podeEditar={profile.role === "cliente_admin"}
        // Sem catálogo não há bloco de serviço: a Miranda não tem base ligada,
        // e um `<select>` vazio é um campo que parece partido.
        executores={config?.executores.map(({ chave, nome }) => ({ chave, nome })) ?? []}
        servicos={servicos}
        timeZone={getClientTimezone(profile.cliente_slug)}
      />
    </div>
  );
}
