import { contextoMovel } from "@/lib/movel/contexto";
import { conversasRapido } from "@/lib/movel/cache";
import { diferencaDias, duracaoCurta, iniciais, quandoCurto } from "@/lib/movel/formato";

import { ListaConversas, type ItemLista } from "./lista";

export const dynamic = "force-dynamic";

/**
 * Conversas (desenho v6, 14/11): "Esperando você" primeiro (a lista única de
 * lib/movel/esperas.ts), depois Hoje / Ontem / Anteriores.
 */
export default async function ConversasMovel() {
  const c = (await contextoMovel())!;
  const { t } = c;
  const agora = new Date();
  let itens: ItemLista[] = [];
  let erro: string | null = null;
  const midia: Record<string, string> = { "[audio]": t("Áudio"), "[documento]": t("Documento"), "[imagem]": t("Foto"), "[video]": t("Vídeo") };

  try {
    const conversas = await conversasRapido(c.clienteSlug);
    itens = conversas.map((v) => {
      const dias = v.quando ? diferencaDias(v.quando, agora, c.fuso) : -99;
      return {
        canal: v.canal,
        conversa: v.conversa,
        espera: v.esperaDesde ? duracaoCurta(v.esperaDesde, agora) : null,
        estado: v.estado,
        grupo: v.estado === "espera" ? "espera" : dias === 0 ? "hoje" : dias === -1 ? "ontem" : "antes",
        iniciais: iniciais(v.nome || "?"),
        nome: v.nome || (v.canal === "instagram" ? t("Cliente do Instagram") : v.canal === "messenger" ? t("Cliente do Messenger") : t("Cliente")),
        previa: midia[v.previa] ?? v.previa,
        previaDe: v.previaDe,
        quando: v.quando ? quandoCurto(v.quando, agora, c.fuso, c.locale, t("Ontem")) : "",
        quente: v.temperatura === "quente",
        telefone: v.telefone,
      };
    });
  } catch {
    erro = t("Não foi possível carregar as conversas.");
  }

  return (
    <main className="m-pagina m6 m6-conversas">
      <ListaConversas
        erro={erro}
        itens={itens}
        textos={{
          agenteDiz: t("Agente:"),
          anteriores: t("Anteriores"),
          comVoce: t("Com você"),
          conversas: t("Conversas"),
          esperando: t("Esperando"),
          esperandoVoce: t("Esperando você"),
          fechar: t("Fechar"),
          hoje: t("Hoje"),
          mostrar: t("Mostrar"),
          nenhuma: t("Nenhuma conversa aqui."),
          ontem: t("Ontem"),
          procurar: t("Procurar"),
          quente: t("quente"),
          quentes: t("Quentes"),
          todas: t("Todas"),
          voce: t("Você:"),
        }}
      />
    </main>
  );
}
