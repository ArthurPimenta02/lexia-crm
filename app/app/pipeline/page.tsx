import { redirect } from "next/navigation";

import { PaginaCabecalho } from "@/app/components/painel-ui";
import { PipelinePanel } from "@/app/components/pipeline-panel";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { getPipeline } from "@/lib/pipeline/read";

export const metadata = {
  title: "Pipeline",
};

export default async function PipelinePage() {
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

  const { cartoes, erro } = await getPipeline(profile.cliente_slug);

  return (
    <div className="flex w-full flex-col gap-6">
      <PaginaCabecalho titulo="Pipeline" />

      {erro ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          {erro}
        </p>
      ) : (
        <PipelinePanel
          cartoes={cartoes}
          timeZone={getClientTimezone(profile.cliente_slug)}
        />
      )}
    </div>
  );
}
