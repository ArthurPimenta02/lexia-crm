import Link from "next/link";
import { redirect } from "next/navigation";

import { ecraPermitido } from "@/lib/auth/ecras";
import { contextoMovel } from "@/lib/movel/contexto";
import { canalDe, telefoneLegivel } from "@/lib/movel/conversas";
import { corDe, iniciais, quandoCurto } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

import { IcBusca } from "../_c/icones";
import { BotaoVoltar } from "../_c/voltar";

export const dynamic = "force-dynamic";

/**
 * Clientes no iPhone: a lista leve das fichas (os mais recentes primeiro),
 * com procura por nome ou número. Toca e abre a conversa. A ficha completa
 * continua no painel do computador.
 */
export default async function ClientesMovel({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  if (!ecraPermitido(c.clienteSlug, "/app/clientes")) redirect("/m/mais");
  const q = String((await searchParams).q ?? "").trim().slice(0, 60);
  // Só letras, números, espaços e alguns sinais: o texto entra num filtro da base.
  const limpo = q.replace(/[^\p{L}\p{N} -]/gu, " ").trim();
  const digitos = limpo.replace(/\D/g, "");
  const agora = new Date();

  let consulta = createAdminClient()
    .from("lexia_contactos")
    .select("id, nome, telefone_digitos, identificador_conversa, origem_tipo, criado_em, atualizado_em")
    .eq("cliente_slug", c.clienteSlug)
    .is("fundido_em", null)
    .order("atualizado_em", { ascending: false, nullsFirst: false })
    .limit(80);
  if (limpo) consulta = digitos.length >= 3 ? consulta.or(`nome.ilike.%${limpo}%,telefone_digitos.ilike.%${digitos}%`) : consulta.ilike("nome", `%${limpo}%`);
  const { data, error } = await consulta;

  const semNome = (canal: string) => (canal === "instagram" ? t("Cliente do Instagram") : canal === "messenger" ? t("Cliente do Messenger") : t("Cliente"));

  return (
    <main className="m-pagina">
      <div className="m-topo">
        <BotaoVoltar reserva="/m/mais" rotulo={t("Voltar")} />
        <div className="m-ola"><b>{t("Clientes")}</b></div>
      </div>
      <form action="/m/clientes" className="m-busca" role="search">
        <IcBusca />
        <input aria-label={t("Procurar por nome ou número")} defaultValue={q} enterKeyHint="search" name="q" placeholder={t("Procurar por nome ou número")} type="search" />
      </form>

      {error ? <div className="m-vazio">{t("Não foi possível carregar os clientes.")}</div> : !data?.length ? (
        <div className="m-vazio">{q ? t("Ninguém encontrado com “{q}”.", { q }) : t("Ainda não há clientes.")}</div>
      ) : (
        <div className="m-lista-conv">
          {data.map((p) => {
            const conversa = String(p.identificador_conversa ?? "");
            const canal = conversa ? canalDe(conversa) : "whatsapp";
            const nome = (p.nome || "").trim() || telefoneLegivel(p.telefone_digitos) || semNome(canal);
            const linha = (
              <>
                <div className="m-av" style={{ background: corDe(conversa || p.id) }}>{iniciais(nome)}<i className={`canal ${canal}`} /></div>
                <div className="m-meio">
                  <b>{nome}</b>
                  <span>{[canal === "whatsapp" ? telefoneLegivel(p.telefone_digitos) : null, p.origem_tipo && p.origem_tipo !== "organico" ? t("de anúncio") : null].filter(Boolean).join(" · ") || " "}</span>
                </div>
                <div className="dir"><span className="h">{p.atualizado_em || p.criado_em ? quandoCurto((p.atualizado_em || p.criado_em) as string, agora, c.fuso, c.locale, t("Ontem")) : ""}</span></div>
              </>
            );
            return conversa ? <Link className="m-conv" href={`/m/conversas/${encodeURIComponent(conversa)}`} key={p.id} prefetch={false}>{linha}</Link> : <div className="m-conv" key={p.id}>{linha}</div>;
          })}
        </div>
      )}
    </main>
  );
}
