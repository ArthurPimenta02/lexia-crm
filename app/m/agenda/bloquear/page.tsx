import { agendasDe } from "@/lib/agenda/google";
import { diaValido } from "@/lib/movel/agenda";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia } from "@/lib/movel/formato";
import { getServicosAgendaveisConfig } from "@/lib/servicos/config";

import { FormBloquear } from "./form";

export const dynamic = "force-dynamic";

/** Bloquear horário (desenho aprovado a 25/11, tela 8). */
export default async function BloquearMovel({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const hoje = chaveDoDia(new Date(), c.fuso);
  const { dia } = await searchParams;
  const agendas = agendasDe(c.clienteSlug);
  const nomes = new Map((getServicosAgendaveisConfig(c.clienteSlug)?.executores.lista ?? []).map((e) => [e.chave, e.nome]));
  const pessoas = Object.keys(agendas).map((chave) => ({ chave, nome: nomes.get(chave) ?? chave }));

  return (
    <FormBloquear
      dia={typeof dia === "string" ? diaValido(dia, hoje) : hoje}
      hoje={hoje}
      motivos={[t("Almoço"), t("Folga"), t("Compromisso")]}
      pessoas={pessoas}
      textos={{
        ate: t("Até"),
        bloquear: t("Bloquear {de} – {ate}"),
        bloquearDia: t("Bloquear o dia inteiro"),
        bloqueado: t("Bloqueado!"),
        de: t("De"),
        dia: t("Dia"),
        diaInteiro: t("Dia inteiro"),
        dica: t("O agente também não marca nesse horário. Aparece na agenda do Google."),
        fechar: t("Fechar"),
        motivo: t("Motivo"),
        outro: t("Outro"),
        outroMotivo: t("Escreva o motivo"),
        quem: t("Quem"),
        semAgenda: t("Ainda não dá para bloquear pelo app nesta empresa."),
        titulo: t("Bloquear horário"),
        todos: t("Todos"),
      }}
    />
  );
}
