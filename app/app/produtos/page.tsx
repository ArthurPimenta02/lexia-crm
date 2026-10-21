import { redirect } from "next/navigation";

import {
  criarProdutoAction,
  definirReceitaDoProdutoAction,
  excluirProdutoAction,
  registarAjusteAction,
  registarCompraAction,
  reporProdutoAction,
} from "@/app/app/produtos/actions";
import { PaginaCabecalho } from "@/app/components/painel-ui";
import { ProdutosPanel } from "@/app/components/produtos-panel";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import {
  getProdutos,
  getProdutosExcluidos,
  getServicosPorProduto,
} from "@/lib/produtos/read";
import { getServicosConfig } from "@/lib/servicos/config";
import { getServicosSimples } from "@/lib/servicos/read";

export const metadata = {
  title: "Produtos e stock",
};

export default async function ProdutosPage() {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app/produtos");

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const [produtos, servicos, excluidos] = await Promise.all([
    getProdutos(profile.cliente_slug),
    getServicosSimples(profile.cliente_slug),
    getProdutosExcluidos(profile.cliente_slug),
  ]);

  // O nome vivo do catálogo ganha ao nome guardado na linha da receita: aquele
  // é a fonte da verdade, este serve só para a linha não ficar ilegível.
  const servicosPorProduto = await getServicosPorProduto(
    profile.cliente_slug,
    produtos,
    new Map(servicos.map((servico) => [servico.id, servico.nome])),
  );

  const moeda = getServicosConfig(profile.cliente_slug)?.moeda ?? "EUR";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PaginaCabecalho titulo="Produtos" />

      <ProdutosPanel
        actionAjuste={registarAjusteAction}
        actionCompra={registarCompraAction}
        actionCriar={criarProdutoAction}
        actionExcluir={excluirProdutoAction}
        actionReceita={definirReceitaDoProdutoAction}
        actionRepor={reporProdutoAction}
        excluidos={excluidos}
        moeda={moeda}
        podeEditar={profile.role === "cliente_admin"}
        produtos={produtos}
        servicos={servicos}
        servicosPorProduto={servicosPorProduto}
        timeZone={getClientTimezone(profile.cliente_slug)}
      />
    </div>
  );
}
