import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O "já li isto" do sino.
 *
 * A autorização fica a cargo de quem chama, como no resto do produto: a rota
 * tira o `user_id` e o `cliente_slug` da sessão no servidor e passa-os para
 * aqui. O `createAdminClient()` é a `service_role` e ignora o RLS, por isso o
 * `user_id` que chega aqui é tratado como verdade — nunca pode vir do corpo
 * do pedido.
 *
 * Porque é que apagar precisa das duas colunas
 * --------------------------------------------
 * A unicidade é `(user_id, chave)`, portanto o `user_id` bastava para apagar
 * a linha certa. O `cliente_slug` vai lá de qualquer forma: é a mesma rede
 * que todas as outras consultas do produto têm, e custa nada.
 */

/** Uma chave não vale nada se não for de um dos três tipos conhecidos. */
const PREFIXOS = ["por_responder:", "handoff:", "marcacao:"];

/** Quantas chaves se aceitam de uma vez. Marcar todos lidos é um pedido só. */
const MAXIMO_DE_CHAVES = 500;

export type MarcarResultado = {
  /** Quantas chaves ficaram marcadas. */
  gravadas: number;
  mensagem: string;
  ok: boolean;
};

function chavesValidas(chaves: string[]) {
  const limpas = new Set<string>();

  for (const bruta of chaves) {
    const chave = typeof bruta === "string" ? bruta.trim() : "";

    // Uma chave com 2000 caracteres não é um aviso, é alguém a encher a
    // tabela. O maior aviso real tem perto de 60.
    if (
      chave === "" ||
      chave.length > 256 ||
      !PREFIXOS.some((prefixo) => chave.startsWith(prefixo))
    ) {
      continue;
    }

    limpas.add(chave);
  }

  return [...limpas].slice(0, MAXIMO_DE_CHAVES);
}

export async function marcarAvisosLidos(
  clienteSlug: string,
  userId: string,
  chaves: string[],
): Promise<MarcarResultado> {
  if (!clienteSlug || !userId) {
    return { gravadas: 0, mensagem: "Sessão sem cliente.", ok: false };
  }

  const paraGravar = chavesValidas(chaves);

  if (paraGravar.length === 0) {
    return { gravadas: 0, mensagem: "Não há avisos para marcar.", ok: true };
  }

  const base = createAdminClient();

  // `upsert` porque marcar duas vezes o mesmo aviso não é erro: o dono abre o
  // sino outra vez e as chaves que já lá estavam voltam no mesmo pedido. O
  // `ignoreDuplicates` deixa a linha antiga intacta — a primeira leitura é a
  // que vale, e é a data dela que faz sentido guardar.
  const { error } = await base.from("lexia_avisos_lidos").upsert(
    paraGravar.map((chave) => ({
      chave,
      cliente_slug: clienteSlug,
      user_id: userId,
    })),
    { ignoreDuplicates: true, onConflict: "user_id,chave" },
  );

  if (error) {
    return {
      gravadas: 0,
      mensagem: "Não foi possível marcar os avisos como lidos.",
      ok: false,
    };
  }

  return { gravadas: paraGravar.length, mensagem: "Avisos marcados.", ok: true };
}

/**
 * Desmarcar: o aviso volta a aparecer.
 *
 * Serve o "marcar como não lido" de um aviso só. Apagar a linha é o gesto
 * certo porque a ausência de linha É o não lido — não há coluna de estado.
 */
export async function desmarcarAviso(
  clienteSlug: string,
  userId: string,
  chave: string,
): Promise<MarcarResultado> {
  if (!clienteSlug || !userId) {
    return { gravadas: 0, mensagem: "Sessão sem cliente.", ok: false };
  }

  const [valida] = chavesValidas([chave]);

  if (!valida) {
    return { gravadas: 0, mensagem: "Aviso desconhecido.", ok: false };
  }

  const base = createAdminClient();
  const { error } = await base
    .from("lexia_avisos_lidos")
    .delete()
    .eq("user_id", userId)
    .eq("cliente_slug", clienteSlug)
    .eq("chave", valida);

  if (error) {
    return {
      gravadas: 0,
      mensagem: "Não foi possível desmarcar o aviso.",
      ok: false,
    };
  }

  return { gravadas: 0, mensagem: "Aviso desmarcado.", ok: true };
}
