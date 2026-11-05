import Link from "next/link";
import { redirect } from "next/navigation";

import { ecraPermitido } from "@/lib/auth/ecras";
import { contextoMovel } from "@/lib/movel/contexto";
import { quandoCurto } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

import { IcMais, IcRobo } from "../_c/icones";
import { BotaoVoltar } from "../_c/voltar";
import { respostasDe } from "./bolhas";
import { VazioMascote } from "@/app/m/_c/vazio";

export const dynamic = "force-dynamic";

/**
 * Área de testes: a lista das conversas de teste da empresa (as mesmas do
 * painel do computador), como a aba Conversas, com o botão de começar uma
 * conversa nova em destaque. Conversas sem nenhuma mensagem não aparecem.
 */
export default async function ListaTestes() {
  const c = (await contextoMovel())!;
  const { t } = c;
  if (!ecraPermitido(c.clienteSlug, "/app/area-testes")) redirect("/m/mais");
  const origem = c.admin ? "painel_admin" : "painel_cliente";
  const agora = new Date();

  const { data, error } = await createAdminClient()
    .from("lexia_testes_execucoes")
    .select("session_id, mensagem_teste, mensagens, resposta_obtida, criado_em")
    .eq("cliente_slug", c.clienteSlug)
    .eq("origem", origem)
    .order("criado_em", { ascending: false })
    .limit(400);

  // Uma linha por conversa: a última troca e quantas mensagens o dono mandou.
  const conversas = new Map<string, { sessao: string; quando: string; previa: string; doAgente: boolean; n: number; titulo: string }>();
  for (const e of data ?? []) {
    const atual = conversas.get(e.session_id);
    if (atual) {
      atual.n += 1;
      // a lista vem da mais nova para a mais antiga: a última vista é a primeira mensagem
      if (e.mensagem_teste) atual.titulo = e.mensagem_teste;
      continue;
    }
    const respostas = respostasDe(e);
    const ultima = respostas[respostas.length - 1];
    conversas.set(e.session_id, {
      doAgente: Boolean(ultima),
      n: 1,
      previa: (ultima || e.mensagem_teste || "").replace(/\s+/g, " ").slice(0, 140),
      quando: e.criado_em ?? "",
      sessao: e.session_id,
      titulo: e.mensagem_teste ?? "",
    });
  }
  // Só as que têm sessão registada: são as que se podem abrir e continuar.
  const ids = [...conversas.keys()];
  const { data: sessoes } = ids.length
    ? await createAdminClient().from("lexia_testes_sessoes").select("session_id").eq("cliente_slug", c.clienteSlug).eq("origem", origem).in("session_id", ids)
    : { data: [] };
  const validas = new Set((sessoes ?? []).map((x) => x.session_id as string));
  const lista = [...conversas.values()].filter((x) => validas.has(x.sessao)).slice(0, 40);

  return (
    <main className="m-pagina">
      <div className="m-topo">
        <BotaoVoltar reserva="/m/mais" rotulo={t("Voltar")} />
        <div className="m-ola"><b>{t("Área de testes")}</b></div>
      </div>

      <Link className="m-nova-teste" href="/m/testes/nova">
        <span className="ic"><IcMais tamanho={22} /></span>
        <span className="tx"><b>{t("Nova conversa de teste")}</b><small>{t("Fale com o agente como se fosse um cliente. Nada é enviado a clientes reais.")}</small></span>
      </Link>

      <div className="m-sec"><h2>{t("Conversas de teste")}</h2>{lista.length ? <span>{lista.length}</span> : null}</div>
      {error ? <div className="m-vazio">{t("Não foi possível carregar.")}</div> : !lista.length ? (
        <VazioMascote>{t("Ainda não há conversas de teste. Comece uma nova.")}</VazioMascote>
      ) : (
        <div className="m-lista-conv">
          {lista.map((x) => (
            <Link className="m-conv" href={`/m/testes/${encodeURIComponent(x.sessao)}`} key={x.sessao} prefetch={false}>
              <div className="m-av" style={{ background: "var(--m-acento-claro)", color: "var(--m-acento)" }}><IcRobo tamanho={16} /></div>
              <div className="m-meio">
                <b>{x.titulo.replace(/\s+/g, " ").slice(0, 80) || t("Conversa de teste")}</b>
                <span>{x.doAgente ? <span className="m-de-agente">{t("Agente:")} </span> : null}{x.previa}</span>
              </div>
              <div className="dir"><span className="h">{x.quando ? quandoCurto(x.quando, agora, c.fuso, c.locale, t("Ontem")) : ""}</span></div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
