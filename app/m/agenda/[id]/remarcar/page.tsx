import { notFound, redirect } from "next/navigation";

import { somarDias } from "@/lib/movel/agenda";
import { lerAgendamento } from "@/lib/movel/agendamento";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, partesNoFuso } from "@/lib/movel/formato";

import { FormRemarcar } from "./form";

export const dynamic = "force-dynamic";

export default async function RemarcarMovel({ params }: { params: Promise<{ id: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const { id } = await params;
  const a = await lerAgendamento(c.clienteSlug, id).catch(() => null);
  if (!a) notFound();
  const agora = new Date();
  if (!a.gerido || a.estado === "cancelado" || Date.parse(a.inicio) <= agora.getTime() || !a.executorChave) redirect(`/m/agenda/${id}`);

  const hoje = chaveDoDia(agora, c.fuso);
  const rotuloDia = (k: string) => {
    const sem = new Intl.DateTimeFormat(c.locale, { timeZone: "UTC", weekday: "short" }).format(new Date(`${k}T12:00:00Z`)).replace(/\./g, "");
    return `${sem.charAt(0).toUpperCase()}${sem.slice(1)} ${Number(k.slice(8))}`;
  };
  const diaAtual = chaveDoDia(a.inicio, c.fuso);

  return (
    <FormRemarcar
      agora={`${rotuloDia(diaAtual)} · ${partesNoFuso(a.inicio, c.fuso).hora}`}
      dia={diaAtual}
      dias={[
        { chave: hoje, rotulo: t("Hoje") },
        { chave: somarDias(hoje, 1), rotulo: t("Amanhã") },
        { chave: somarDias(hoje, 2), rotulo: rotuloDia(somarDias(hoje, 2)) },
      ]}
      duracaoMinutos={Math.round((Date.parse(a.fim) - Date.parse(a.inicio)) / 60_000)}
      executor={a.executorChave!}
      hoje={hoje}
      id={a.id}
      nome={[a.nome, a.servico].filter(Boolean).join(" · ")}
      textos={{
        confirmar: t("Remarcar para {dia} às {hora}"),
        dia: t("Dia"),
        escolha: t("Escolha o novo horário"),
        fechar: t("Fechar"),
        horario: t("Horário livre"),
        maisHorarios: t("Mais horários"),
        mesmoAssim: t("Remarcar mesmo assim"),
        nenhumLivre: t("Nenhum horário livre neste dia."),
        ocupado: t("Já há algo nesse horário:"),
        outroDia: t("Outro dia"),
        outroHorario: t("Outro horário"),
        remarcado: t("Remarcado!"),
        titulo: t("Remarcar"),
        hojeEsta: t("Hoje está em {quando}"),
      }}
    />
  );
}
