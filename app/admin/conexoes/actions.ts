"use server";

import { revalidatePath } from "next/cache";

import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { cifrar, decifrar, finalDe } from "@/lib/conexoes/cifra";
import { juntarSegredos, tipoConexao } from "@/lib/conexoes/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConexaoState = {
  message: string | null;
  type: "success" | "error" | null;
};

/**
 * Grava uma conexão. Só `lexia_admin`.
 *
 * `clienteSlug` vazio = conexão global da Lexia. Os campos que não são
 * segredo vão em claro em `campos`; os segredos são juntados aos antigos
 * (em branco = manter), cifrados e gravados em `segredos`.
 */
export async function salvarConexao(
  clienteSlug: string,
  tipo: string,
  _state: ConexaoState,
  formData: FormData,
): Promise<ConexaoState> {
  const { profile, user } = await getLoggedInUserProfile();
  if (!user || profile?.role !== "lexia_admin") {
    return { message: "Acesso não autorizado.", type: "error" };
  }

  const definicao = tipoConexao(tipo);
  if (!definicao) return { message: "Tipo de conexão desconhecido.", type: "error" };

  const slug = clienteSlug.trim() || null;
  const admin = createAdminClient();

  if (slug) {
    const { data: cliente } = await admin
      .from("lexia_clientes")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();
    if (!cliente) return { message: "Cliente não encontrado.", type: "error" };
  }

  let consulta = admin
    .from("lexia_conexoes")
    .select("id, segredos")
    .eq("tipo", tipo);
  consulta = slug ? consulta.eq("cliente_slug", slug) : consulta.is("cliente_slug", null);
  const { data: atual, error: erroLeitura } = await consulta.maybeSingle();
  if (erroLeitura) {
    if (erroLeitura.code === "42P01" || erroLeitura.code === "PGRST205") {
      return { message: "Falta correr a migration da Fase 19 no Supabase central.", type: "error" };
    }
    return { message: "Não foi possível ler a conexão atual.", type: "error" };
  }

  const campos: Record<string, string> = {};
  const novosSegredos: Record<string, string> = {};
  const apagar: string[] = [];
  for (const campo of definicao.campos) {
    const valor = String(formData.get(campo.nome) ?? "").trim();
    if (campo.segredo) {
      if (valor) novosSegredos[campo.nome] = valor;
      if (formData.get(`apagar_${campo.nome}`) === "on") apagar.push(campo.nome);
    } else if (valor) {
      campos[campo.nome] = valor;
    }
  }

  let antigos: Record<string, string> = {};
  try {
    antigos = atual?.segredos ? decifrar(atual.segredos) : {};
  } catch (erro) {
    return {
      message: erro instanceof Error ? erro.message : "Não foi possível ler os segredos gravados.",
      type: "error",
    };
  }

  const segredos = juntarSegredos(antigos, novosSegredos, apagar);
  const finais = Object.fromEntries(
    Object.entries(segredos).map(([nome, valor]) => [nome, finalDe(valor)]),
  );

  let cifrado: string | null = null;
  try {
    cifrado = Object.keys(segredos).length ? cifrar(segredos) : null;
  } catch (erro) {
    return {
      message: erro instanceof Error ? erro.message : "Não foi possível cifrar os segredos.",
      type: "error",
    };
  }

  const linha = {
    cliente_slug: slug,
    tipo,
    campos,
    segredos: cifrado,
    finais,
    atualizado_em: new Date().toISOString(),
    atualizado_por: user.id,
  };
  const { error } = atual
    ? await admin.from("lexia_conexoes").update(linha).eq("id", atual.id)
    : await admin.from("lexia_conexoes").insert(linha);

  if (error) return { message: "Não foi possível gravar a conexão.", type: "error" };

  revalidatePath("/admin/conexoes");
  return { message: `${definicao.titulo}: gravado.`, type: "success" };
}
