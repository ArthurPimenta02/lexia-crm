import { contextoMovel } from "@/lib/movel/contexto";
import { conversasRapido } from "@/lib/movel/cache";
import { corDe, duracaoCurta, iniciais, quandoCurto } from "@/lib/movel/formato";

import { ListaConversas, type ItemLista } from "./lista";

export const dynamic = "force-dynamic";

export default async function ConversasMovel() {
  const c = (await contextoMovel())!;
  const agora = new Date();
  let itens: ItemLista[] = [];
  let erro: string | null = null;

  try {
    const conversas = await conversasRapido(c.clienteSlug);
    itens = conversas.map((v) => ({
      canal: v.canal,
      cor: corDe(v.conversa),
      conversa: v.conversa,
      espera: v.esperaDesde ? duracaoCurta(v.esperaDesde, agora) : null,
      estado: v.estado,
      iniciais: iniciais(v.nome || "?"),
      nome: v.nome || (v.canal === "instagram" ? c.t("Cliente do Instagram") : v.canal === "messenger" ? c.t("Cliente do Messenger") : c.t("Cliente")),
      previa: v.previa,
      previaDe: v.previaDe,
      quando: v.quando ? quandoCurto(v.quando, agora, c.fuso, c.locale, c.t("Ontem")) : "",
      telefone: v.telefone,
    }));
  } catch {
    erro = c.t("Não foi possível carregar as conversas.");
  }

  return (
    <main className="m-pagina">
      <ListaConversas
        erro={erro}
        itens={itens}
        textos={{
          agente: c.t("Agente"),
          agenteDiz: c.t("Agente:"),
          comigo: c.t("Comigo"),
          conversas: c.t("Conversas"),
          espera: c.t("À espera"),
          nenhuma: c.t("Nenhuma conversa aqui."),
          procurar: c.t("Procurar clientes ou mensagens"),
          todas: c.t("Todas"),
          voce: c.t("Você:"),
        }}
      />
    </main>
  );
}
