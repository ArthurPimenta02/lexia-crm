import "server-only";

import { getClientTimezone } from "@/lib/clientes/timezone";

import { clientesAtivos, contextoMovel, type ContextoMovel } from "./contexto";

/**
 * Para envios a partir do painel do computador: na Lexia (admin) a página diz
 * de que empresa é a conversa (`?cliente=`), e é essa que vale — não a escolha
 * guardada no app. O dono nunca escolhe: fica sempre a empresa dele, diga o
 * pedido o que disser. Empresa pedida que não está ativa → sem acesso.
 */
export async function contextoDaEmpresa(pedida: unknown): Promise<ContextoMovel | null> {
  const c = await contextoMovel();
  if (!c || !c.admin || typeof pedida !== "string" || !pedida || pedida === c.clienteSlug) return c;
  const cliente = (await clientesAtivos()).find((x) => x.slug === pedida);
  if (!cliente) return null;
  return { ...c, clienteNome: cliente.nome, clienteSlug: cliente.slug, fuso: getClientTimezone(cliente.slug) };
}
