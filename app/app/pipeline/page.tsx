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

  const { agendaFutura, agendaSemLigacao, cartoes, erro } = await getPipeline(
    profile.cliente_slug,
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <PaginaCabecalho titulo="Pipeline" />

      {erro ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
          {erro}
        </p>
      ) : (
        <>
          {/*
            Isto não é decoração: é a diferença entre "o quadro está partido" e
            "a agenda não dá para ligar". Medido a 2026-10-18, 83% dos eventos
            das agendas do Google são escritos à mão e a maioria não leva
            telefone — sem telefone não há como saber a que lead pertencem, e a
            coluna "Agendado" fica vazia apesar de haver marcações. Dizê-lo
            aqui poupa a pergunta.
          */}
          {agendaSemLigacao > 0 ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
              Há {agendaFutura}{" "}
              {agendaFutura === 1 ? "marcação" : "marcações"} na agenda daqui
              para a frente, e {agendaSemLigacao}{" "}
              {agendaSemLigacao === 1 ? "não consegue" : "não conseguem"}{" "}
              ligar-se a nenhum cartão: o evento foi escrito à mão no Google
              sem telefone, e é o telefone que faz a ponte. Essas não aparecem
              na coluna &ldquo;Agendado&rdquo;.
            </p>
          ) : null}

          <PipelinePanel
            cartoes={cartoes}
            timeZone={getClientTimezone(profile.cliente_slug)}
          />
        </>
      )}
    </div>
  );
}
