import "server-only";

import type { Escopo } from "@/lib/ajudante/ferramentas";
import { fichaDoAgente } from "@/lib/ajudante/fichas";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ferramenta "como_funciona_o_agente": a ficha técnica do agente da empresa da
 * SESSÃO (nunca de outra: o slug vem do `Escopo` montado no servidor, o modelo
 * não escolhe empresa) + o estado atual dos interruptores, lido de
 * lexia_clientes. Só lê.
 *
 * Os interruptores só valem para os agentes que os leem de facto. Ex.: a lista
 * de espera da Miranda e do Detail liga-se no servidor do agente, não pela coluna do painel.
 */

type Interruptor = "followups_longos" | "lista_espera";
type Fonte = true | { estado: string; nota: string };

// De onde vem cada interruptor: `true` = coluna de lexia_clientes que o agente lê; senão, o estado fixo no servidor.
const NO_SERVIDOR = { estado: "ligado", nota: "ligado no servidor do agente (não segue o interruptor do painel)" };
const LIDOS: Record<string, Partial<Record<Interruptor, Fonte>>> = {
  claudia_leite_spa: { followups_longos: true, lista_espera: true },
  detail_by_cordeiro: { followups_longos: true, lista_espera: NO_SERVIDOR },
  miranda_skin_experts: { followups_longos: true, lista_espera: NO_SERVIDOR },
};

const NOMES: Record<Interruptor, string> = {
  followups_longos: "Follow-ups de 3 e 7 dias (pela temperatura do lead)",
  lista_espera: "Lista de espera para vagas que abrem",
};

type Linha = { followups_longos: boolean | null; lista_espera: boolean | null; modo_teste: boolean | null; status: string | null };

async function lerInterruptores(slug: string) {
  const { data, error } = await createAdminClient()
    .from("lexia_clientes")
    .select("status, modo_teste, followups_longos, lista_espera")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("lexia_clientes");
  return (data ?? null) as Linha | null;
}

export const fichaAgente = {
  como_funciona_o_agente: {
    descricao:
      "Como o agente de atendimento DESTA empresa funciona: canais, horários e regras de agenda, o que faz sozinho e o que passa à equipe, lembretes de marcação (quando e por onde), confirmação, remarcar/cancelar, follow-ups, lista de espera, pausas, idiomas, promoções e o que nunca faz — mais o estado atual dos interruptores (ligado/desligado). Use SEMPRE que o dono perguntar se existe alguma mensagem automática ou como o agente se comporta. Responda só com o que está na ficha; se não estiver, diga que não consta.",
    executar: async (e: Escopo) => {
      const ficha = fichaDoAgente(e.clienteSlug);
      if (!ficha) {
        return { dados: { erro: `Ainda não há ficha técnica do agente de ${e.clienteNome}. Diga ao dono que essa informação ainda não está disponível aqui e não invente como o agente funciona.` } };
      }
      const lidos = LIDOS[e.clienteSlug] ?? {};
      // Sem leitura (erro ou empresa sem linha), a ficha sai na mesma e os interruptores dizem que não se leram.
      const linha = await lerInterruptores(e.clienteSlug).catch(() => null);
      const interruptores = (Object.keys(lidos) as Interruptor[]).map((chave) => {
        const lido = lidos[chave];
        if (lido !== true) return { interruptor: NOMES[chave], ...lido };
        if (!linha) return { interruptor: NOMES[chave], estado: "não foi possível ler agora" };
        return { interruptor: NOMES[chave], estado: linha[chave] === true ? "ligado" : "desligado" };
      });
      return {
        dados: {
          empresa: e.clienteNome,
          ficha,
          interruptores,
          ...(linha?.modo_teste ? { modo_teste: "a conta está em modo de teste no painel" } : {}),
          ...(linha?.status && linha.status !== "ativo" ? { conta: `estado da conta: ${linha.status}` } : {}),
        },
      };
    },
    parametros: { additionalProperties: false, properties: {}, required: [], type: "object" },
    rotulo: "Vendo como o agente funciona",
  },
};
