
import { clientesAtivos, contextoMovel } from "@/lib/movel/contexto";
import { iniciais } from "@/lib/movel/formato";
import { NOME_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { COOKIE_MODO_MOVEL, modoValido } from "@/lib/movel/modo";
import { cookies } from "next/headers";

import Link from "next/link";

import { IcDocumento, IcEmpresa, IcGlobo, IcPessoa, IcSair, IcSeta } from "../_c/icones";
import { Aparencia } from "./aparencia";
import { FaceId } from "./face-id";
import { Meta } from "./meta";
import { escolherEmpresa, sairDoApp } from "./acoes";
import { PreferenciasAvisos } from "./preferencias";
import { BotaoVoltar } from "../_c/voltar";

export const dynamic = "force-dynamic";

export default async function AjustesMovel() {
  const c = (await contextoMovel())!;
  const { t } = c;
  const empresas = c.admin ? await clientesAtivos() : [];
  const modo = modoValido((await cookies()).get(COOKIE_MODO_MOVEL)?.value);

  return (
    <main className="m-pagina sem-abas">
      <div className="m-topo" style={{ paddingBottom: 10 }}>
        <BotaoVoltar reserva="/m" rotulo={t("Voltar")} />
        <div className="m-ola"><b>{t("Ajustes")}</b></div>
      </div>

      <div className="m-perfil">
        <div className="m-avatar">{iniciais(c.nomeUsuario || c.clienteNome)}</div>
        <div style={{ minWidth: 0 }}><b>{c.nomeUsuario || t("Você")}</b><span>{c.clienteNome}{c.admin ? ` · ${t("Lexia")}` : ""}</span></div>
      </div>

      <div className="m-rotulo-g">{t("Aparência")}</div>
      <div className="m-caixa"><Aparencia inicial={modo} textos={{ auto: t("Automático"), claro: t("Claro"), escuro: t("Escuro") }} /></div>

      <div className="m-rotulo-g">{t("Meta do mês")}</div>
      <Meta
        conta={c.meta.conta}
        mes={c.meta.mes}
        textos={{ agente: t("só os do agente"), contar: t("Contar"), erro: t("Não foi possível gravar."), guardada: t("Meta gravada."), guardar: t("Gravar"), porMes: t("Agendamentos por mês"), todos: t("todos os agendamentos") }}
      />

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

      <div className="m-rotulo-g" id="avisos">{t("Avisos no iPhone")}</div>
      <PreferenciasAvisos
        textos={{
          agenda: t("Agendamentos"), agendaSub: t("novo, remarcado, cancelado"),
          espera: t("Cliente à espera"), esperaSub: t("ninguém respondeu em 5 minutos"),
          manual: t("Também os marcados à mão"), manualSub: t("normalmente foi você que marcou"),
          resumo: t("Resumo da manhã"), resumoSub: t("às 8h, o dia num aviso"),
          todos: t("Todas as empresas"), todosSub: t("só para a Lexia"),
          erro: t("Não foi possível gravar."),
        }}
        admin={c.admin}
      />

      <div className="m-rotulo-g">{t("App")}</div>
      <div className="m-caixa">
        <FaceId textos={{ codigo: t("Pedir o código ao abrir"), faceid: t("Pedir Face ID ao abrir"), sub: t("ninguém abre o app sem você"), touchid: t("Pedir Touch ID ao abrir") }} />
        <div className="m-opcao"><div className="ic"><IcGlobo /></div><div><b>{t("Idioma")}</b></div><span className="m-valor-dir">{NOME_DO_IDIOMA[c.idioma]} · {t("igual ao iPhone")}</span></div>
        <a className="m-opcao" href="https://uselexia.app/privacy-policy"><div className="ic"><IcDocumento /></div><div style={{ flex: 1 }}><b>{t("Política de privacidade")}</b></div><IcSeta /></a>
        <form action={sairDoApp}>
          <button className="m-opcao" style={{ color: "var(--m-vermelho)" }} type="submit"><div className="ic" style={{ color: "var(--m-vermelho)" }}><IcSair /></div><div><b>{t("Sair")}</b></div></button>
        </form>
      </div>

      <div className="m-caixa" style={{ marginTop: 16 }}>
        <Link className="m-opcao" href="/m/ajustes/excluir" style={{ color: "var(--m-vermelho)" }}><div className="ic" style={{ color: "var(--m-vermelho)" }}><IcPessoa /></div><div style={{ flex: 1 }}><b>{t("Excluir minha conta")}</b></div><IcSeta /></Link>
      </div>
    </main>
  );
}
