import { redirect } from "next/navigation";

import {
  definirReceitaAction,
  excluirServicoAction,
  gravarServicoAction,
  registarExecucaoAction,
  reporServicoAction,
} from "@/app/app/servicos/actions";
import { ServicosPanel } from "@/app/components/servicos-panel";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getPainelServicos } from "@/lib/servicos/read";

export const metadata = {
  title: "Serviços e margem",
};

export default async function ServicosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  const parametros = await searchParams;
  const escalaoPedido = parametros.escalao;
  const painel = await getPainelServicos({
    clienteSlug: profile.cliente_slug,
    escalao: Array.isArray(escalaoPedido) ? escalaoPedido[0] : escalaoPedido,
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
            Serviços
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Custo e margem por serviço
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-600">
            O preço e a duração vêm do teu catálogo, já como estão. O que tens
            de dizer aqui é quanto cada serviço gasta de cada produto. O custo
            sai do que pagaste na última compra desse produto e a margem é
            calculada a partir daí — nunca é guardada, muda sozinha quando
            mexes num preço ou compras mais caro.
          </p>
          <p className="mt-2 max-w-2xl text-zinc-600">
            Cada vez que carregas em <strong>Realizei este serviço</strong>, as
            quantidades da receita saem do stock.
          </p>
        </div>
      </div>

      <ServicosPanel
        action={gravarServicoAction}
        actionExcluir={excluirServicoAction}
        actionExecucao={registarExecucaoAction}
        actionReceita={definirReceitaAction}
        actionRepor={reporServicoAction}
        basePath="/app/servicos"
        painel={painel}
        podeEditar={profile.role === "cliente_admin"}
      />
    </div>
  );
}
