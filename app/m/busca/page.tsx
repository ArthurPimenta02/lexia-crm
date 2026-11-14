import Link from "next/link";

import { contextoMovel } from "@/lib/movel/contexto";
import { canalDe, telefoneLegivel } from "@/lib/movel/conversas";
import { iniciais, quandoCurto } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

import { IcBusca } from "../_c/icones";
import { Iniciais } from "../_c/pecas";
import { BotaoVoltar } from "../_c/voltar";

export const dynamic = "force-dynamic";

/** Termo seguro para o filtro ilike do PostgREST (sem os caracteres que mudam o sentido do filtro). */
function termo(q: string) {
  return q.replace(/[,()*%\\"]/g, " ").trim().slice(0, 60);
}

export default async function BuscaMovel({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const q = termo(String((await searchParams).q ?? ""));
  const agora = new Date();
  const base = createAdminClient();

  type Ficha = { identificador_conversa: string; nome: string | null; telefone: string | null };
  type Msg = { identificador_conversa: string; conteudo: string | null; criado_em: string };
  let fichas: Ficha[] = [];
  let msgs: Msg[] = [];
  if (q.length >= 2) {
    const digitos = q.replace(/\D/g, "");
    const [f, m] = await Promise.all([
      base.from("lexia_contactos").select("identificador_conversa, nome, telefone").eq("cliente_slug", c.clienteSlug)
        .or([`nome.ilike.*${q}*`, digitos.length >= 4 ? `telefone_digitos.ilike.*${digitos}*` : null].filter(Boolean).join(",")).limit(20),
      base.from("lexia_mensagens").select("identificador_conversa, conteudo, criado_em").eq("cliente_slug", c.clienteSlug)
        .gte("criado_em", new Date(agora.getTime() - 120 * 86_400_000).toISOString()).ilike("conteudo", `%${q}%`).order("criado_em", { ascending: false }).limit(25),
    ]);
    fichas = (f.data ?? []) as Ficha[];
    msgs = (m.data ?? []) as Msg[];
  }
  const nomes = new Map<string, string>();
  if (msgs.length) {
    const { data } = await base.from("lexia_contactos").select("identificador_conversa, nome").eq("cliente_slug", c.clienteSlug).in("identificador_conversa", [...new Set(msgs.map((m) => m.identificador_conversa))]);
    for (const x of data ?? []) if (x.nome) nomes.set(x.identificador_conversa, x.nome);
  }
  const vistas = new Set<string>();
  const msgsUnicas = msgs.filter((m) => (vistas.has(m.identificador_conversa) ? false : (vistas.add(m.identificador_conversa), true)));
  const trecho = (texto: string) => {
    let s = texto;
    try { const j = JSON.parse(texto); if (j && typeof j === "object") s = String(j.texto ?? ""); } catch { /* texto simples */ }
    s = s.replace(/\s+/g, " ");
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    return i > 14 ? `…${s.slice(i - 10, i + 80)}` : s.slice(0, 95);
  };

  return (
    <main className="m-pagina m6">
      <header className="m6-cab volta">
        <BotaoVoltar reserva="/m" rotulo={t("Voltar")} />
        <h1>{t("Procurar")}</h1>
      </header>
      <form action="/m/busca" className="m6-busca" role="search">
        <IcBusca />
        <input aria-label={t("Procurar")} autoFocus={!q} defaultValue={q} enterKeyHint="search" name="q" placeholder={t("Nome, número ou palavra da conversa")} type="search" />
      </form>

      {q.length < 2 ? null : (
        <>
          {fichas.length ? (
            <>
              <div className="m-sec"><h2>{t("Clientes")}</h2></div>
              <div className="m-lista-conv">
                {fichas.map((f) => (
                  <Link className="m-conv" href={`/m/conversas/${encodeURIComponent(f.identificador_conversa)}`} key={f.identificador_conversa}>
                    <Iniciais canal={canalDe(f.identificador_conversa)} tamanho={40} texto={iniciais(f.nome || "?")} />
                    <div className="m-meio"><b>{f.nome || telefoneLegivel(f.telefone?.replace(/\D/g, "") ?? null) || t("Cliente")}</b><span>{telefoneLegivel(f.telefone?.replace(/\D/g, "") ?? null) ?? ""}</span></div>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
          {msgsUnicas.length ? (
            <>
              <div className="m-sec"><h2>{t("Mensagens")}</h2></div>
              <div className="m-lista-conv">
                {msgsUnicas.map((m) => (
                  <Link className="m-conv" href={`/m/conversas/${encodeURIComponent(m.identificador_conversa)}`} key={m.identificador_conversa}>
                    <Iniciais canal={canalDe(m.identificador_conversa)} tamanho={40} texto={iniciais(nomes.get(m.identificador_conversa) || "?")} />
                    <div className="m-meio"><b>{nomes.get(m.identificador_conversa) || telefoneLegivel(m.identificador_conversa.replace(/\D/g, "")) || t("Cliente")}</b><span>{trecho(m.conteudo ?? "")}</span></div>
                    <div className="dir"><span className="h">{quandoCurto(m.criado_em, agora, c.fuso, c.locale, t("Ontem"))}</span></div>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
          {!fichas.length && !msgsUnicas.length ? <div className="m-vazio" style={{ marginTop: 16 }}>{t("Nada encontrado para “{q}”.", { q })}</div> : null}
        </>
      )}
    </main>
  );
}
