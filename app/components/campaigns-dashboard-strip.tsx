import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { formatCampanhasMoney } from "@/app/components/campaigns-panel";
import { CampaignsRefreshButton } from "@/app/components/campaigns-refresh-button";
import { GrupoMetricas, SeccaoTitulo } from "@/app/components/painel-ui";
import type { AtualizarCampanhasResultado } from "@/lib/campaigns/refresh";
import { getResumoCampanhas } from "@/lib/campaigns/read";
import {
  getDateInputValue,
  getInclusiveRangeEnd,
} from "@/lib/dashboard/date-range";
import { getMetaAdsConfig } from "@/lib/meta/ads";

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-PT").format(value);
}

/**
 * A faixa de campanhas do dashboard: investido, custo por conversa e entrega.
 *
 * Só aparece a quem tem conta de anúncios ligada. O teste é o mesmo que o cron
 * da sincronização usa (`getMetaAdsConfig(slug) !== null`): um cliente sem Meta
 * Ads não é uma avaria, é quem ainda não anuncia — e a esse não se mostra uma
 * faixa de zeros a dar a entender que o dinheiro não está a render.
 *
 * O período e o denominador vêm de fora, do dashboard que a desenha. É isso que
 * garante que o "custo por conversa" usa exactamente as conversas iniciadas que
 * o ecrã mostra duas faixas acima, em vez de uma segunda contagem que daria um
 * número ligeiramente diferente no mesmo ecrã.
 */
export async function CampaignsDashboardStrip({
  acaoAtualizar,
  clienteSlug,
  conversasIniciadas,
  hrefCampanhas,
  range,
  slugNoFormulario,
  timezone,
}: {
  acaoAtualizar: (
    estado: AtualizarCampanhasResultado | null,
    formData: FormData,
  ) => Promise<AtualizarCampanhasResultado>;
  clienteSlug: string;
  /** Conversas iniciadas no período, já contadas pelo dashboard. */
  conversasIniciadas: number;
  hrefCampanhas: string;
  range: { end: Date; start: Date };
  /**
   * Slug a enviar no formulário da actualização. Só o admin o preenche: a
   * action do cliente tira-o do perfil no servidor de propósito, para que o
   * navegador não possa pedir o gasto de outra empresa.
   */
  slugNoFormulario?: string;
  timezone: string;
}) {
  if (getMetaAdsConfig(clienteSlug) === null) {
    return null;
  }

  const resumo = await getResumoCampanhas({
    clienteSlug,
    fim: getDateInputValue(getInclusiveRangeEnd(range.end), timezone),
    inicio: getDateInputValue(range.start, timezone),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SeccaoTitulo
          dica="O gasto da Meta é sincronizado uma vez por dia, às 06:00 UTC. O número de hoje é o que havia à hora da sincronização; para o ver ao minuto, usa o Atualizar."
          sufixo="no período"
        >
          Campanhas
        </SeccaoTitulo>

        <div className="flex items-start gap-3">
          {/*
            O botão está aqui, e não só no ecrã de Campanhas, porque é neste que
            o valor desactualizado se nota: o gasto de hoje nasce congelado na
            hora da sincronização da madrugada, e quem olha para o dashboard
            quer o número de agora sem ter de mudar de ecrã.
          */}
          <CampaignsRefreshButton
            action={acaoAtualizar}
            atualizadoEm={
              resumo.atualizadoEm
                ? new Intl.DateTimeFormat("pt-PT", {
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "2-digit",
                    timeZone: timezone,
                  }).format(new Date(resumo.atualizadoEm))
                : null
            }
            clienteSlug={slugNoFormulario}
            compacto
          />

          <Link
            className="inline-flex h-[30px] shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            href={hrefCampanhas}
          >
            Ver campanhas
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {resumo.temDados ? (
        <GrupoMetricas
          itens={[
            {
              dica: "Soma do que a Meta cobrou nos dias do período, no fuso da conta de anúncios.",
              label: "Investido",
              valor: formatCampanhasMoney(resumo.gasto, resumo.moeda),
            },
            {
              /*
               * O rótulo não é "custo por mensagem" porque não há como o
               * calcular: a Meta não devolve conversas iniciadas nesta conta, e
               * a maior parte do gasto vai para o Instagram Direct, que não
               * identifica o anúncio de origem. O denominador são *todas* as
               * conversas do período, incluindo quem chegou sem anúncio, o que
               * faz deste número um limite superior do custo real de um lead
               * pago — serve para comparar períodos, não para o afirmar.
               */
              dica: "Investido a dividir por todas as conversas iniciadas no período, e não só pelas que vieram de anúncio. É por isso um limite superior do custo real de uma conversa paga.",
              label: "Custo por conversa",
              nota:
                conversasIniciadas > 0
                  ? `${conversasIniciadas} conversa${conversasIniciadas === 1 ? "" : "s"} iniciada${conversasIniciadas === 1 ? "" : "s"}`
                  : undefined,
              valor:
                conversasIniciadas > 0
                  ? formatCampanhasMoney(
                      resumo.gasto / conversasIniciadas,
                      resumo.moeda,
                    )
                  : "--",
            },
            {
              dica: "Cliques em qualquer parte do anúncio.",
              label: "Cliques",
              nota: `${formatNumber(resumo.cliquesLink)} no link`,
              valor: formatNumber(resumo.cliques),
            },
            {
              dica: "Custo por mil impressões, recalculado do total do período.",
              label: "CPM",
              valor:
                resumo.impressoes > 0
                  ? formatCampanhasMoney(
                      (resumo.gasto / resumo.impressoes) * 1000,
                      resumo.moeda,
                    )
                  : "--",
            },
          ]}
        />
      ) : (
        /*
         * Conta ligada e nenhum gasto no período não é o mesmo que conta por
         * ligar. A faixa de métricas marcaria estas células como "Por ligar",
         * que é exactamente a leitura errada, por isso aqui diz-se o que se
         * passa numa linha.
         */
        <div className="rounded-2xl border border-border bg-surface-muted px-5 py-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            A conta de anúncios da Meta está ligada, mas não há gasto
            sincronizado neste período. Em{" "}
            <Link
              className="font-medium text-foreground underline"
              href={hrefCampanhas}
            >
              Campanhas
            </Link>{" "}
            podes puxar o histórico com &quot;Atualizar dados&quot;.
          </p>
        </div>
      )}
    </div>
  );
}
