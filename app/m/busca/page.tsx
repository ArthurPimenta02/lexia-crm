import Link from "next/link";

import { contextoMovel } from "@/lib/movel/contexto";
import { canalDe, telefoneLegivel } from "@/lib/movel/conversas";
import { corDe, iniciais, quandoCurto } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

import { IcBusca, IcCanal } from "../_c/icones";

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
    return i > 30 ? `…${s.slice(i - 25, i + 70)}` : s.slice(0, 95);
  };

  return (
    <main className="m-pagina">
      <div className="m-titulo"><h1>{t("Procurar")}</h1></div>
      <form action="/m/busca" className="m-busca" role="search">
        <IcBusca />
        <input aria-label={t("Procurar")} autoFocus={!q} defaultValue={q} enterKeyHint="search" name="q" placeholder={t("Nome, número ou palavra da conversa")} type="search" />
      </form>

      {q.length < 2 ? <p className="m-discreto" style={{ marginTop: 24 }}>{t("Escreva um nome, um número ou uma palavra que o cliente disse.")}</p> : (
        <>
          {fichas.length ? (
            <>
              <div className="m-sec"><h2>{t("Clientes")}</h2></div>
              <div className="m-caixa">
                {fichas.map((f) => (
                  <Link className="m-conv" href={`/m/conversas/${encodeURIComponent(f.identificador_conversa)}`} key={f.identificador_conversa}>
                    <div className="m-av" style={{ background: corDe(f.identificador_conversa) }}>{iniciais(f.nome || "?")}<i className={`canal ${canalDe(f.identificador_conversa)}`}><IcCanal canal={canalDe(f.identificador_conversa)} tamanho={10} /></i></div>
                    <div className="m-meio"><b>{f.nome || telefoneLegivel(f.telefone?.replace(/\D/g, "") ?? null) || t("Cliente")}</b><span>{telefoneLegivel(f.telefone?.replace(/\D/g, "") ?? null) ?? ""}</span></div>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
          {msgsUnicas.length ? (
            <>
              <div className="m-sec"><h2>{t("Mensagens")}</h2></div>
              <div className="m-caixa">
                {msgsUnicas.map((m) => (
                  <Link className="m-conv" href={`/m/conversas/${encodeURIComponent(m.identificador_conversa)}`} key={m.identificador_conversa}>
                    <div className="m-av" style={{ background: corDe(m.identificador_conversa) }}>{iniciais(nomes.get(m.identificador_conversa) || "?")}<i className={`canal ${canalDe(m.identificador_conversa)}`}><IcCanal canal={canalDe(m.identificador_conversa)} tamanho={10} /></i></div>
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
