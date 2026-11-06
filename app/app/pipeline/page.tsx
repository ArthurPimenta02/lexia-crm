import { redirect } from "next/navigation";

import { PipelinePanel } from "@/app/components/pipeline-panel";
import { AvisoLinha, CabecalhoTela } from "@/app/components/tela";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { getT } from "@/lib/i18n/servidor";
import { getPipeline } from "@/lib/pipeline/read";

export async function generateMetadata() {
  const t = await getT();

  return { title: t("Pipeline") };
}

export default async function PipelinePage() {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app/pipeline");

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const t = await getT();
  const { cartoes, erro } = await getPipeline(profile.cliente_slug);

  return (
    <div className="flex w-full flex-col gap-6">
      {erro ? (
        <>
          <CabecalhoTela resto={t("Pipeline")} />
          <AvisoLinha tom="perigo">{t(erro)}</AvisoLinha>
        </>
      ) : (
        <PipelinePanel
          cartoes={cartoes}
          timeZone={getClientTimezone(profile.cliente_slug)}
        />
      )}
    </div>
  );
}
