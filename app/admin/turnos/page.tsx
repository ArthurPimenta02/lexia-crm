import { redirect } from "next/navigation";

import { AvisoLinha, CabecalhoTela, FiltroTrilho } from "@/app/components/tela";
import { ControleVista } from "@/app/admin/turnos/vista";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { agruparConversas, turnoEscolhido, type TurnoNaConversa } from "@/lib/turnos/controle";
import type { TurnoCompleto } from "@/lib/turnos/formatar";
import { inicioUltimas24h } from "@/lib/turnos/mapa";
import { AtualizacaoAutomatica } from "@/app/components/atualizacao-automatica";
import { sinalDaTela } from "@/lib/sinais/sinal-da-tela";
import { getT } from "@/lib/i18n/servidor";

/**
 * Controle do agente em código: o equivalente às execuções do n8n, mas por
 * conversa. À esquerda as conversas, ao meio a conversa como no WhatsApp, à
 * direita o caminho que o agente fez para a resposta escolhida, desenhado por
 * etapas (lib/turnos/mapa.ts). O desenho está em ./vista.tsx.
 *
 * Só `lexia_admin`: a tabela `lexia_turnos` traz prompts e regras internas, é
 * fechada à service_role e esta página lê do servidor.
 */

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const modos = ["", "producao", "sombra", "teste"];
const COLUNAS =
  "id, cliente_slug, agente, modo, identificador_conversa, canal, estado, motivo, erro, mensagem_cliente, mensagens, rota, custo_usd, duracao_ms, criado_em";

function valor(v: string | string[] | undefined) {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function ControlePage({ searchParams }: Props) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");
  const t = await getT();

  const params = await searchParams;
  const cliente = valor(params.cliente);
  const modo = modos.includes(valor(params.modo)) ? valor(params.modo) : "";
  const so = valor(params.so) === "problemas" ? "problemas" : "";

  const admin = createAdminClient();
  let lista = admin.from("lexia_turnos").select(COLUNAS).order("criado_em", { ascending: false }).limit(500);
  if (cliente) lista = lista.eq("cliente_slug", cliente);
  if (modo) lista = lista.eq("modo", modo);

  const ultimoDe = (m: string) => {
    let q = admin.from("lexia_turnos").select("criado_em").eq("modo", m).order("criado_em", { ascending: false }).limit(1);
    if (cliente) q = q.eq("cliente_slug", cliente);
    return q;
  };

  const [{ data, error }, { data: clientesData }, { data: ultProd }, { data: ultSombra }] = await Promise.all([
    lista,
    admin.from("lexia_clientes").select("slug, nome").order("nome"),
    ultimoDe("producao"),
    ultimoDe("sombra"),
  ]);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return (
        <section className="flex flex-col gap-6">
          <CabecalhoTela resto={t("Controle do agente")} />
          <AvisoLinha>
            {t("A tabela de turnos ainda não existe. Falta rodar a migration da Fase 18 no Supabase central.")}
          </AvisoLinha>
        </section>
      );
    }
    throw new Error("Não foi possível buscar os turnos.");
  }

  const turnos = (data ?? []) as TurnoNaConversa[];
  const clientes = (clientesData ?? []).map((c) => c.slug as string);
  const nomeDoCliente: Record<string, string> = {};
  for (const c of (clientesData ?? []) as { slug: string; nome: string | null }[]) {
    nomeDoCliente[c.slug] = c.nome || c.slug;
  }
  const desde = inicioUltimas24h();
  const recentes = turnos.filter((t) => Date.parse(t.criado_em) >= desde);
  const resumos = agruparConversas(turnos, so === "problemas").slice(0, 80);

  const conversaId = valor(params.conversa).trim() || resumos[0]?.id || "";
  const ids = [...new Set([...resumos.map((r) => r.id), conversaId].filter(Boolean))];

  let daConversaQ = admin
    .from("lexia_turnos")
    .select(`${COLUNAS}, n8n:resumo->n8n_respondeu`)
    .eq("identificador_conversa", conversaId)
    .order("criado_em", { ascending: true })
    .limit(200);
  if (modo) daConversaQ = daConversaQ.eq("modo", modo);
  if (cliente) daConversaQ = daConversaQ.eq("cliente_slug", cliente);

  const [{ data: nomesData }, { data: daConversaData }] = await Promise.all([
    ids.length
      ? admin.from("lexia_contactos").select("identificador_conversa, nome").in("identificador_conversa", ids)
      : Promise.resolve({ data: [] as { identificador_conversa: string; nome: string | null }[] }),
    conversaId ? daConversaQ : Promise.resolve({ data: [] as TurnoNaConversa[] }),
  ]);
  const nomes: Record<string, string> = {};
  for (const n of (nomesData ?? []) as { identificador_conversa: string; nome: string | null }[]) {
    if (n.nome) nomes[n.identificador_conversa] = n.nome;
  }
  const daConversa = (daConversaData ?? []) as TurnoNaConversa[];

  const turnoId = turnoEscolhido(daConversa, valor(params.turno));
  const { data: turnoData } = turnoId
    ? await admin.from("lexia_turnos").select("*").eq("id", turnoId).maybeSingle()
    : { data: null };

  const filtroHref = (mudar: Record<string, string>) => {
    const q = new URLSearchParams();
    const base = { cliente, modo, so, ...mudar };
    for (const [k, v] of Object.entries(base)) if (v) q.set(k, v);
    const texto = q.toString();
    return texto ? `/admin/turnos?${texto}` : "/admin/turnos";
  };
  const filtros = (
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
      <FiltroTrilho
        opcoes={["", ...clientes].map((c) => ({
          ativo: c === cliente,
          href: filtroHref({ cliente: c }),
          label: c ? nomeDoCliente[c] : t("Todos"),
        }))}
        rotulo={t("Cliente")}
      />
      <FiltroTrilho
        opcoes={[
          { label: t("Todos os modos"), valor: "" },
          { label: t("Produção"), valor: "producao" },
          { label: t("Sombra"), valor: "sombra" },
          { label: t("Área de testes"), valor: "teste" },
        ].map((o) => ({ ativo: o.valor === modo, href: filtroHref({ modo: o.valor }), label: o.label }))}
        rotulo={t("Modo")}
      />
      <FiltroTrilho
        opcoes={[
          { label: t("Todas as conversas"), valor: "" },
          { label: t("Só com erro"), valor: "problemas" },
        ].map((o) => ({ ativo: o.valor === so, href: filtroHref({ so: o.valor }), label: o.label }))}
        rotulo={t("Mostrar")}
      />
    </div>
  );

  return (
    <>
    <AtualizacaoAutomatica segundos={10} sinal={sinalDaTela.bind(null, "turnos", cliente || null)} />
    <ControleVista
      conversaId={conversaId}
      daConversa={daConversa}
      filtroAtual={{ cliente, modo, so }}
      filtros={filtros}
      nomes={nomes}
      recentes={recentes}
      resumos={resumos}
      turno={(turnoData as TurnoCompleto | null) ?? null}
      turnoId={turnoId}
      ultimaProducao={(ultProd?.[0]?.criado_em as string | undefined) ?? null}
      ultimaSombra={(ultSombra?.[0]?.criado_em as string | undefined) ?? null}
    />
    </>
  );
}
