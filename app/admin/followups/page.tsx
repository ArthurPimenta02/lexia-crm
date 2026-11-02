import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { FollowupsVista } from "@/app/admin/followups/vista";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConsultaLinha, FollowupDetalhe, FollowupLinha, TurnoDoFollowup } from "@/lib/followups/leitura";
import { agoraMs } from "@/lib/followups/leitura";

/**
 * Follow-ups e lembretes do agente em código. Só `lexia_admin`.
 *
 * Marcados: base do cliente (lexia_followups e a tabela de marcações), lida
 * com a service_role do cliente no servidor. Enviados: lexia_turnos do CRM
 * (rota followup/lembrete, modo produção). Só leitura: para parar um
 * follow-up, bloqueia-se o contacto em /admin/bloqueios.
 */

const CLIENTES: Record<string, { envPrefix: string; consultas: string; nome: string }> = {
  miranda_skin_experts: { envPrefix: "MIRANDA", consultas: "agendamentos_miranda_skin", nome: "Miranda Skin Experts" },
};

function baseDoCliente(envPrefix: string) {
  const url = process.env[`${envPrefix}_SUPABASE_URL`]?.trim();
  const chave = process.env[`${envPrefix}_SUPABASE_SERVICE_ROLE_KEY`]?.trim();
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function FollowupsPage({ searchParams }: Props) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const params = await searchParams;
  const fuPedido = Array.isArray(params.fu) ? params.fu[0] : params.fu;
  const slug = "miranda_skin_experts";
  const cfg = CLIENTES[slug];
  const base = baseDoCliente(cfg.envPrefix);
  const agora = agoraMs();
  const seteDias = new Date(agora - 7 * 86400_000).toISOString();
  const ontem = new Date(agora - 86400_000).toISOString();

  const admin = createAdminClient();
  const vazio = Promise.resolve({ data: [] as never[], error: null });
  const [marcados, encerrados, consultas, turnos] = await Promise.all([
    base
      ? base
          .from("lexia_followups")
          .select("id, canal, identificador, nome_contacto, etapa, status, ultima_msg_cliente_em, proxima_tentativa_em, tentativas_enviadas, motivo_encerramento, dia_combinado, atualizado_em")
          .eq("cliente_slug", slug)
          .eq("status", "agendado")
          .order("proxima_tentativa_em", { ascending: true })
          .limit(200)
      : vazio,
    base
      ? base
          .from("lexia_followups")
          .select("id, canal, identificador, nome_contacto, etapa, status, ultima_msg_cliente_em, proxima_tentativa_em, tentativas_enviadas, motivo_encerramento, dia_combinado, atualizado_em")
          .eq("cliente_slug", slug)
          .neq("status", "agendado")
          .gte("atualizado_em", seteDias)
          .order("atualizado_em", { ascending: false })
          .limit(100)
      : vazio,
    base
      ? base
          .from(cfg.consultas)
          .select("id, nome_cliente, telefone, servico, inicio, status, lembrete_enviado_em, criado_via")
          .gte("inicio", ontem)
          .order("inicio", { ascending: true })
          .limit(100)
      : vazio,
    admin
      .from("lexia_turnos")
      .select("id, criado_em, identificador_conversa, estado, motivo, mensagens, custo_usd, rota")
      .eq("cliente_slug", slug)
      .eq("modo", "producao")
      .in("rota", ["followup", "lembrete"])
      .gte("criado_em", seteDias)
      .order("criado_em", { ascending: false })
      .limit(200),
  ]);

  // A janela de detalhe: o follow-up pedido (só deste cliente) e o que já lhe saiu.
  let selecionado: FollowupDetalhe | null = null;
  let turnosDoSelecionado: TurnoDoFollowup[] = [];
  if (base && fuPedido && /^[0-9a-f-]{36}$/i.test(fuPedido)) {
    const { data: f } = await base
      .from("lexia_followups")
      .select("id, canal, identificador, nome_contacto, etapa, status, ultima_msg_cliente_em, ultima_msg_agente_em, proxima_tentativa_em, tentativas_enviadas, motivo_encerramento, motivo_juiz, dia_combinado, atualizado_em")
      .eq("cliente_slug", slug)
      .eq("id", fuPedido)
      .maybeSingle();
    selecionado = (f as FollowupDetalhe | null) ?? null;
    if (selecionado?.identificador) {
      const { data: ts } = await admin
        .from("lexia_turnos")
        .select("id, criado_em, estado, motivo, mensagens, custo_usd")
        .eq("cliente_slug", slug)
        .eq("modo", "producao")
        .eq("rota", "followup")
        .eq("identificador_conversa", selecionado.identificador)
        .order("criado_em", { ascending: false })
        .limit(20);
      turnosDoSelecionado = (ts ?? []) as TurnoDoFollowup[];
    }
  }

  const ids = [...new Set((turnos.data ?? []).map((t) => t.identificador_conversa).filter(Boolean))] as string[];
  const { data: nomesData } = ids.length
    ? await admin.from("lexia_contactos").select("identificador_conversa, nome").in("identificador_conversa", ids)
    : { data: [] as { identificador_conversa: string; nome: string | null }[] };
  const nomes: Record<string, string> = {};
  for (const n of nomesData ?? []) if (n.nome) nomes[n.identificador_conversa] = n.nome;

  return (
    <FollowupsVista
      agora={agora}
      baseLigada={Boolean(base)}
      cliente={slug}
      consultas={(consultas.data ?? []) as ConsultaLinha[]}
      encerrados={(encerrados.data ?? []) as FollowupLinha[]}
      erroBase={Boolean(marcados.error || consultas.error)}
      marcados={(marcados.data ?? []) as FollowupLinha[]}
      nomeCliente={cfg.nome}
      nomes={nomes}
      selecionado={selecionado}
      turnosDoSelecionado={turnosDoSelecionado}
      turnos={(turnos.data ?? []) as never}
    />
  );
}
