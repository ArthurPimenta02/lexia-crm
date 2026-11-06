"use client";

import { GraficoArea } from "@/app/components/graficos";
import { useIdioma } from "@/app/components/idioma";

/**
 * Gasto por dia das campanhas, no gráfico de área do dashboard.
 *
 * Vive num componente de cliente só porque o gráfico pede uma função para
 * escrever o valor (na moeda da conta), e funções não passam do servidor.
 */
export function CampaignsGraficoGasto({
  dias,
  moeda,
  nomeSerie,
  vazio,
}: {
  dias: { contactos: number; dia: string; gasto: number }[];
  moeda: string;
  nomeSerie: string;
  vazio: string;
}) {
  const { locale } = useIdioma();
  const dinheiro = new Intl.NumberFormat(locale, {
    currency: moeda,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  });

  return (
    <GraficoArea
      formatar={(n) => dinheiro.format(n)}
      rotulos={dias.map((d) => {
        const [, mes, dia] = d.dia.split("-");
        return `${dia}/${mes}`;
      })}
      series={[{ nome: nomeSerie, valores: dias.map((d) => d.gasto) }]}
      vazio={vazio}
    />
  );
}
