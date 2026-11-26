import "server-only";

import { paraConfirmar } from "@/lib/agenda/presenca";
import type { ContextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, partesNoFuso } from "@/lib/movel/formato";

/** Os atendimentos por confirmar, já com o "quando" escrito ("Ontem 15:00"). */
export async function itensParaConfirmar(c: ContextoMovel, agora = new Date()) {
  const lista = await paraConfirmar(c.clienteSlug, agora).catch(() => []);
  const hoje = chaveDoDia(agora, c.fuso);
  const ontem = chaveDoDia(new Date(agora.getTime() - 86_400_000), c.fuso);
  return lista.map((l) => {
    const dia = chaveDoDia(l.inicio, c.fuso);
    const hora = partesNoFuso(l.inicio, c.fuso).hora;
    const quando = dia === hoje ? `${c.t("Hoje")} ${hora}` : dia === ontem ? `${c.t("Ontem")} ${hora}` : `${new Intl.DateTimeFormat(c.locale, { day: "numeric", month: "short", timeZone: c.fuso }).format(new Date(l.inicio)).replace(/\./g, "")} ${hora}`;
    return { id: l.id, nome: l.nome || c.t("Cliente"), quando, servico: l.servico };
  });
}
