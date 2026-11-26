import { notFound } from "next/navigation";

import { canaisDeAquisicao } from "@/lib/clientes/ficha";
import { contextoMovel } from "@/lib/movel/contexto";
import { lerFicha } from "@/lib/movel/ficha";
import { isValidConversationId } from "@/lib/redis/agent-locks";

import { FormEditarFicha } from "./form";

export const dynamic = "force-dynamic";

/** De onde veio + notas (desenho aprovado a 25/11, tela 12). */
export default async function EditarFichaMovel({ params }: { params: Promise<{ conversa: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const conversa = decodeURIComponent((await params).conversa);
  if (!isValidConversationId(conversa)) notFound();
  const d = await lerFicha(c.clienteSlug, conversa).catch(() => null);
  if (!d?.contactoId) notFound();
  const ficha = `/m/conversas/${encodeURIComponent(conversa)}/ficha`;

  return (
    <FormEditarFicha
      contactoId={d.contactoId}
      detetado={d.deAnuncio ? (d.anuncio ? t("A Lexia detectou que veio do anúncio {nome}.", { nome: d.anuncio }) : t("A Lexia detectou que veio de um anúncio.")) : null}
      nome={d.nome}
      notas={d.notas ?? ""}
      opcoes={canaisDeAquisicao.map((x) => ({ rotulo: x.value === "meta" ? t("Anúncio") : t(x.label), valor: x.value }))}
      origem={d.origemManual?.valor ?? ""}
      origemNota={d.origemManual?.nota ?? ""}
      textos={{
        automatico: t("Automático (o que a Lexia detectou)"),
        deOnde: t("De onde veio?"),
        deOutro: t("Escreva de onde veio"),
        fechar: t("Fechar"),
        guardado: t("Guardado!"),
        notas: t("Notas"),
        notasDica: t("Ex.: pele sensível, prefere depois das 14h"),
        salvar: t("Salvar"),
      }}
      volta={ficha}
    />
  );
}
