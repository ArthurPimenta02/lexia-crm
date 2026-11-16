import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { lerOnboarding, listarArquivos, type Achados, type EstadoOnboarding, type Etapa1 } from "@/lib/onboarding/dados";
import { situacaoDoCaderno } from "@/lib/onboarding/etapa1";
import { ESQUEMA_ONBOARDING } from "@/lib/onboarding/esquema";
import { chaveDoCliente } from "@/lib/onboarding/ia";

/** Tudo o que a tela da Etapa 1 mostra, para uma empresa. As duas portas (cliente e admin) usam isto. */
export async function dadosDaEtapa1(admin: SupabaseClient, clienteSlug: string) {
  const onb = await lerOnboarding(admin, clienteSlug);
  const [arquivos, situacao, ia] = await Promise.all([
    onb ? listarArquivos(admin, clienteSlug, onb.id) : Promise.resolve([]),
    onb ? situacaoDoCaderno(admin, clienteSlug, onb.id) : Promise.resolve(null),
    chaveDoCliente(admin, clienteSlug),
  ]);
  const rotulo = new Map(ESQUEMA_ONBOARDING.flatMap((s) => [...s.campos, ...s.grupos.flatMap((g) => g.campos)]).map((c) => [c.chave, c.pergunta]));
  const titulos = new Map(ESQUEMA_ONBOARDING.map((s) => [s.chave, s.titulo]));
  // O rascunho, para conferir antes de liberar: o que foi achado, seção a seção.
  const achado = (situacao?.caderno ?? [])
    .filter((c) => c.linha && c.situacao === "por_confirmar")
    .map((c) => ({
      secao: titulos.get(c.secao) ?? c.secao,
      grupo: c.grupo as string | null,
      itemId: c.itemId,
      chave: c.campo.chave,
      pergunta: rotulo.get(c.campo.chave) ?? c.campo.chave,
      valor: c.linha!.valor,
      fonte: c.linha!.fonte,
    }));
  return {
    achado,
    achados: (onb?.achados ?? {}) as Achados,
    arquivos: arquivos.filter((a) => a.origem === "etapa1").map((a) => ({ id: a.id, nome: a.nome ?? "arquivo", tamanho: a.tamanho ?? 0, lido: !!a.texto_em })),
    estado: (onb?.estado ?? "etapa1") as EstadoOnboarding,
    etapa1: (onb?.etapa1 ?? {}) as Etapa1,
    numeros: situacao
      ? { raizTotal: situacao.raizTotal, raizPreenchidos: situacao.raizPreenchidos, servicos: situacao.servicos, servicosComPreco: situacao.servicosComPreco, servicosComDuracao: situacao.servicosComDuracao, faqs: situacao.faqs, profissionais: situacao.profissionais, promocoes: situacao.promocoes }
      : null,
    temChaveDeIa: !!ia,
  };
}
