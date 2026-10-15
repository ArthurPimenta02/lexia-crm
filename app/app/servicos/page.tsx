import { redirect } from "next/navigation";

import {
  gravarCustoHoraAction,
  gravarServicoAction,
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
            O preço e a duração vêm do teu catálogo, já como estão. Só precisas
            de preencher duas coisas: quanto custa uma hora de cada pessoa e
            quanto gastas de produto em cada serviço. A margem é calculada a
            partir daí e nunca é guardada — muda sozinha sempre que mexes num
            preço.
          </p>
        </div>
      </div>

      <ServicosPanel
        action={gravarServicoAction}
        actionCustoHora={gravarCustoHoraAction}
        basePath="/app/servicos"
        painel={painel}
        podeEditar={profile.role === "cliente_admin"}
      />
    </div>
  );
}
