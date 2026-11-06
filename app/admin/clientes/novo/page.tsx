import Link from "next/link";

import { NewClientForm } from "@/app/admin/clientes/novo/new-client-form";
import { CabecalhoTela } from "@/app/components/tela";
import { getT } from "@/lib/i18n/servidor";

export default async function NewClientPage() {
  const t = await getT();

  return (
    <section className="flex w-full min-w-0 max-w-4xl flex-col gap-6">
      <CabecalhoTela
        acoes={
          <Link className="ds-botao ds-botao-secundario ds-botao-p" href="/admin">
            {t("Cancelar")}
          </Link>
        }
        resto={t("Novo cliente")}
        sobretitulo={t("Admin Lexia · clientes")}
        subtitulo={t("Nome e slug bastam para começar. O workflow pode vir depois.")}
      />

      <NewClientForm />
    </section>
  );
}
