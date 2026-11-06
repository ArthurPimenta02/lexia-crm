import Link from "next/link";

import { CabecalhoTela, VazioTela } from "@/app/components/tela";
import { getT } from "@/lib/i18n/servidor";

export default async function AdminSettingsPage() {
  const t = await getT();

  return (
    <section className="flex w-full max-w-5xl flex-col gap-6">
      <CabecalhoTela resto={t("Configurações")} sobretitulo={t("Admin Lexia")} />
      <div className="ds-bloco">
        <VazioTela
          acao={
            <div className="flex flex-wrap justify-center gap-2">
              <Link className="ds-botao ds-botao-primario ds-botao-p" href="/admin/conexoes">
                {t("Conexões")}
              </Link>
              <Link className="ds-botao ds-botao-secundario ds-botao-p" href="/admin/bloqueios">
                {t("Contatos bloqueados")}
              </Link>
            </div>
          }
          texto={t("As chaves de cada agente ficam em Conexões, e quem o agente não atende fica em Contatos bloqueados.")}
          titulo={t("Ainda não há nada para configurar aqui.")}
        />
      </div>
    </section>
  );
}
