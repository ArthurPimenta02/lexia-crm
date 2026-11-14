import Link from "next/link";

import { ecraPermitido } from "@/lib/auth/ecras";
import { maisRapido } from "@/lib/movel/cache";
import { contextoMovel } from "@/lib/movel/contexto";
import { chaveDoDia, diferencaDias, iniciais, moeda } from "@/lib/movel/formato";
import type { DadosMais } from "@/lib/movel/mais";

import { IcAnuncios, IcCalendario, IcEngrenagem, IcEstrela, IcFrasco, IcPessoas, IcSeta, IcSino } from "../_c/icones";

export const dynamic = "force-dynamic";

/** Mais (desenho v6, 14/11): o perfil, a meta do mês e as outras telas, numa lista com fios. */
export default async function MaisMovel() {
  const c = (await contextoMovel())!;
  const { t } = c;
  let d: DadosMais | null = null;
  try {
    d = await maisRapido(c.clienteSlug, c.fuso);
  } catch {
    d = null;
  }
  const agora = new Date();
  const hoje = chaveDoDia(agora, c.fuso);
  const pode = (ecra: string) => ecraPermitido(c.clienteSlug, ecra);
  const feitos = d ? (c.meta.conta === "agente" ? d.mes.agente : d.mes.todos) : 0;
  const pct = c.meta.mes ? Math.min(100, Math.round((feitos / c.meta.mes) * 100)) : 0;
  const mes = new Intl.DateTimeFormat(c.locale, { month: "long", timeZone: "UTC" }).format(new Date(`${hoje}T12:00:00Z`));
  const faltamDias = d ? Math.max(0, diferencaDias(`${d.mes.ultimoDia}T12:00:00Z`, agora, c.fuso)) : 0;

  const item = (href: string, icone: React.ReactNode, rotulo: string, lado?: string | null) => (
    <Link className="m6-item" href={href} key={href}>
      <span className="ic">{icone}</span>
      {rotulo}
      <span className="lado">{lado ?? null}<IcSeta tamanho={14} /></span>
    </Link>
  );
  const telas = [
    pode("/app/campanhas") ? item("/m/campanhas", <IcAnuncios tamanho={18} />, t("Campanhas"), d?.anuncios ? moeda(d.anuncios.gasto, c.locale, d.anuncios.moeda) : null) : null,
    pode("/app/clientes") ? item("/m/clientes", <IcPessoas tamanho={18} />, t("Clientes")) : null,
    pode("/app/agenda") ? item("/m/agenda", <IcCalendario tamanho={18} />, t("Agenda")) : null,
    pode("/app/area-testes") ? item("/m/testes", <IcFrasco tamanho={18} />, t("Testar o agente")) : null,
    pode("/app/analista") ? item("/m/ajudante?tela=/m/mais", <IcEstrela tamanho={18} />, t("Analista Lexia")) : null,
  ].filter(Boolean);

  return (
    <main className="m-pagina m6">
      <Link className="m6-perfil" href="/m/ajustes">
        <span aria-hidden="true" className="m-ini" style={{ fontSize: 17, height: 52, width: 52 }}>{iniciais(c.nomeUsuario || c.clienteNome).slice(0, 1)}</span>
        <span className="tx"><b>{c.nomeUsuario || t("Você")}</b><span>{c.clienteNome}</span></span>
        <IcSeta tamanho={16} />
      </Link>

      {c.meta.mes ? (
        <Link aria-label={t("Meta do mês")} className="m6-meta" href="/m/ajustes#meta">
          <span className="l1"><span className="m6-rotulo">{t("Meta de {mes}", { mes })}</span>{faltamDias ? <span className="s">{faltamDias === 1 ? t("falta 1 dia") : t("faltam {n} dias", { n: faltamDias })}</span> : null}</span>
          <span className="l2"><span className="n">{feitos}</span> <span className="s">{t("de {total} agendamentos", { total: c.meta.mes })}</span></span>
          <span aria-hidden="true" className="barra"><span style={{ width: `${pct}%` }} /></span>
        </Link>
      ) : (
        <Link className="m6-meta" href="/m/ajustes#meta">
          <span className="l1"><span className="m6-rotulo">{t("Meta de {mes}", { mes })}</span><span className="ac">{t("Definir meta")}</span></span>
        </Link>
      )}

      {telas.length ? <nav aria-label={t("Telas")} className="m6-grupo-itens">{telas}</nav> : null}
      <nav aria-label={t("Conta")} className="m6-grupo-itens">
        {item("/m/avisos", <IcSino tamanho={18} />, t("Avisos"))}
        {item("/m/ajustes", <IcEngrenagem tamanho={18} />, t("Ajustes"))}
      </nav>
    </main>
  );
}
