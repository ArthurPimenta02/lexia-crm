import Link from "next/link";

import { contextoMovel } from "@/lib/movel/contexto";
import { clientesSumidos } from "@/lib/movel/sumidos";
import { telefoneLegivel } from "@/lib/movel/conversas";

import { IcConversa, IcVoltar } from "../../_c/icones";
import { VazioMascote } from "../../_c/vazio";

export const dynamic = "force-dynamic";

const PERIODOS = [30, 60, 90] as const;

/** Clientes sumidos (desenho aprovado a 25/11, tela 9). */
export default async function SumidosMovel({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const pedido = Number((await searchParams).dias);
  const dias = (PERIODOS as readonly number[]).includes(pedido) ? pedido : 60;
  const lista = await clientesSumidos(c.clienteSlug, dias).catch(() => []);

  return (
    <main className="m-pagina m6">
      <header className="m6-cab" style={{ alignItems: "center", display: "flex", gap: 10 }}>
        <Link aria-label={t("Voltar")} className="ag-x" href="/m/mais"><IcVoltar tamanho={18} /></Link>
        <h1>{t("Clientes sumidos")}</h1>
      </header>
      <p className="ag-dica" style={{ margin: "-12px 0 0", textAlign: "left" }}>{t("Já vieram, não voltaram e não têm nada marcado.")}</p>
      <nav aria-label={t("Período")} className="ag-pilulas">
        {PERIODOS.map((p) => <Link className={`ag-pil${p === dias ? " on" : ""}`} href={`/m/clientes/sumidos?dias=${p}`} key={p} replace>{t("{n} dias", { n: p })}</Link>)}
      </nav>
      {lista.length ? (
        <section className="ag-sumidos">
          {lista.map((s) => {
            const conversa = `/m/conversas/${encodeURIComponent(`whatsapp:${s.telefone}`)}`;
            const nome = s.nome || telefoneLegivel(s.telefone) || t("Cliente");
            return (
              <div className="ag-sumido" key={s.telefone}>
                <Link className="tx" href={`${conversa}/ficha`} prefetch={false}>
                  <b>{nome}</b>
                  <small>{[s.servico, t("última vez há {n} dias", { n: s.dias })].filter(Boolean).join(" · ")}</small>
                </Link>
                <Link className="chamar" href={conversa} prefetch={false}><IcConversa tamanho={15} />{t("Chamar")}</Link>
              </div>
            );
          })}
        </section>
      ) : <VazioMascote>{t("Ninguém sumido neste período.")}</VazioMascote>}
    </main>
  );
}
