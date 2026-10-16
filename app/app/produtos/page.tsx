import { redirect } from "next/navigation";

import {
  criarProdutoAction,
  definirReceitaDoProdutoAction,
  excluirProdutoAction,
  registarAjusteAction,
  registarCompraAction,
  reporProdutoAction,
} from "@/app/app/produtos/actions";
import { ProdutosPanel } from "@/app/components/produtos-panel";
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
      <div>
        <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
          Produtos
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Stock e duração dos produtos
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600">
          O stock é a soma do que registas: as compras entram, e cada serviço
          que marcas como realizado tira o que a receita diz. O custo por
          unidade vem da tua última compra, por isso actualiza-se sozinho
          quando voltas a comprar.
        </p>
        <p className="mt-2 max-w-2xl text-zinc-600">
          A previsão de quanto tempo falta é contada a partir do dia em que
          começas a registar — não há histórico importado, e com menos de duas
          execuções registadas não aparece número nenhum.
        </p>
      </div>

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
