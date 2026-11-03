import { redirect } from "next/navigation";

import {
  definirReceitaAction,
  excluirServicoAction,
  gravarServicoAction,
  registarExecucaoAction,
  reporServicoAction,
} from "@/app/app/servicos/actions";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { ServicosPanel } from "@/app/components/servicos-panel";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { getPainelServicos } from "@/lib/servicos/read";

export async function generateMetadata() {
  const t = await getT();

  return { title: t("Serviços e margem") };
}

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

  exigirEcra(profile.cliente_slug, "/app/servicos");

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const parametros = await searchParams;
  const escalaoPedido = parametros.escalao;
  const painel = await getPainelServicos({
    clienteSlug: profile.cliente_slug,
    escalao: Array.isArray(escalaoPedido) ? escalaoPedido[0] : escalaoPedido,
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PaginaCabecalho titulo={t("Serviços")} />

      <ServicosPanel
        action={gravarServicoAction}
        actionExcluir={excluirServicoAction}
        actionExecucao={registarExecucaoAction}
        actionReceita={definirReceitaAction}
        actionRepor={reporServicoAction}
        basePath="/app/servicos"
        locale={locale}
        painel={painel}
        podeEditar={profile.role === "cliente_admin" && !painel.somenteLeitura}
        t={t}
      />
    </div>
  );
}
