import Link from "next/link";

import { clientesAtivos, contextoMovel } from "@/lib/movel/contexto";
import { iniciais } from "@/lib/movel/formato";
import { NOME_DO_IDIOMA } from "@/lib/i18n/idiomas";

import { IcEmpresa, IcGlobo, IcLua, IcSair, IcVoltar } from "../_c/icones";
import { escolherEmpresa, sairDoApp } from "./acoes";
import { PreferenciasAvisos } from "./preferencias";

export const dynamic = "force-dynamic";

export default async function AjustesMovel() {
  const c = (await contextoMovel())!;
  const { t } = c;
  const empresas = c.admin ? await clientesAtivos() : [];

  return (
    <main className="m-pagina sem-abas">
      <div className="m-topo" style={{ paddingBottom: 10 }}>
        <Link aria-label={t("Voltar")} className="m-redondo" href="/m"><IcVoltar /></Link>
        <div className="m-ola"><b>{t("Ajustes")}</b></div>
      </div>

      <div className="m-perfil">
        <div className="m-avatar">{iniciais(c.nomeUsuario || c.clienteNome)}</div>
        <div style={{ minWidth: 0 }}><b>{c.nomeUsuario || t("Você")}</b><span>{c.clienteNome}{c.admin ? ` · ${t("Lexia")}` : ""}</span></div>
      </div>

      {c.admin ? (
        <>
          <div className="m-rotulo-g">{t("Empresa que o app mostra")}</div>
          <div className="m-caixa">
            {empresas.map((e) => (
              <form action={escolherEmpresa} key={e.slug}>
                <input name="slug" type="hidden" value={e.slug} />
                <button className="m-opcao" type="submit">
                  <div className="ic"><IcEmpresa /></div>
                  <div><b>{e.nome}</b></div>
                  <span className={`m-radio${e.slug === c.clienteSlug ? " on" : ""}`} />
                </button>
              </form>
            ))}
          </div>
        </>
      ) : null}

      <div className="m-rotulo-g">{t("Avisos no iPhone")}</div>
      <PreferenciasAvisos
        textos={{
          agenda: t("Agendamentos"), agendaSub: t("novo, remarcado, cancelado"),
          espera: t("Cliente à espera"), esperaSub: t("ninguém respondeu em 5 minutos"),
          manual: t("Também os marcados à mão"), manualSub: t("normalmente foi você que marcou"),
          todos: t("Todas as empresas"), todosSub: t("só para a Lexia"),
          erro: t("Não foi possível gravar."),
        }}
        admin={c.admin}
      />

      <div className="m-rotulo-g">{t("App")}</div>
      <div className="m-caixa">
        <div className="m-opcao"><div className="ic"><IcGlobo /></div><div><b>{t("Idioma")}</b></div><span className="m-valor-dir">{NOME_DO_IDIOMA[c.idioma]} · {t("igual ao iPhone")}</span></div>
        <div className="m-opcao"><div className="ic"><IcLua /></div><div><b>{t("Aparência")}</b></div><span className="m-valor-dir">{t("Igual ao iPhone")}</span></div>
        <form action={sairDoApp}>
          <button className="m-opcao" style={{ color: "var(--m-vermelho)" }} type="submit"><div className="ic" style={{ color: "var(--m-vermelho)" }}><IcSair /></div><div><b>{t("Sair")}</b></div></button>
        </form>
      </div>
    </main>
  );
}
