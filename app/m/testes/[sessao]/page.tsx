import { notFound } from "next/navigation";

import { contextoMovel } from "@/lib/movel/contexto";
import { partesNoFuso } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

import { COLUNAS_EXECUCAO, type ExecucaoTeste } from "../bolhas";
import { ChatTeste } from "../chat-teste";

export const dynamic = "force-dynamic";

/**
 * Uma conversa de teste: o dono fala com o agente da empresa dele como se
 * fosse um cliente. `/m/testes/nova` abre o chat vazio; a sessão só nasce na
 * primeira mensagem (assim não ficam conversas vazias na lista). Nunca manda
 * nada a um cliente real.
 */
export default async function ConversaTeste({ params }: { params: Promise<{ sessao: string }> }) {
  const c = (await contextoMovel())!;
  const t = c.t;
  const { sessao: bruto } = await params;
  const nova = bruto === "nova";
  if (!nova && !/^[\w-]{8,80}$/.test(bruto)) notFound();
  const origem = c.admin ? "painel_admin" : "painel_cliente";
  const base = createAdminClient();

  const [{ data: wfs }, { data: sess }] = await Promise.all([
    base.from("lexia_workflows").select("id, nome, tipo").eq("cliente_slug", c.clienteSlug).eq("status", "ativo").order("nome", { ascending: true }),
    nova
      ? Promise.resolve({ data: null })
      : base.from("lexia_testes_sessoes").select("session_id").eq("cliente_slug", c.clienteSlug).eq("origem", origem).eq("session_id", bruto).maybeSingle(),
  ]);
  if (!nova && !sess) notFound();
  const sessao = nova ? null : bruto;

  const { data: execs } = sessao
    ? await base.from("lexia_testes_execucoes").select(COLUNAS_EXECUCAO).eq("cliente_slug", c.clienteSlug).eq("origem", origem).eq("session_id", sessao).order("criado_em", { ascending: true })
    : { data: [] };

  return (
    <ChatTeste
      execucoes={(execs ?? []) as ExecucaoTeste[]}
      fuso={c.fuso}
      hoje={partesNoFuso(new Date(), c.fuso).chave}
      locale={c.locale}
      sessao={sessao}
      textos={{
        agente: t("Agente"),
        aguardando: t("O agente está pensando…"),
        demorou: t("O agente ainda não respondeu. Toque para verificar de novo."),
        enviar: t("Enviar"),
        erroEnvio: t("Não foi enviada. Toque para tentar de novo."),
        hoje: t("Hoje"),
        mensagem: t("Mensagem"),
        nova: t("Nova conversa de teste"),
        novaFeita: t("Conversa de teste nova. A anterior continua no painel."),
        ontem: t("Ontem"),
        semMensagens: t("Escreva como se fosse um cliente. Nada é enviado a clientes reais."),
        semSessao: t("Sua sessão expirou. Entre de novo."),
        semWorkflow: t("Nenhum workflow ativo configurado para este cliente."),
        subtitulo: t("Teste do agente · {empresa}", { empresa: c.clienteNome }),
        titulo: t("Área de testes"),
        voltar: t("Voltar"),
      }}
      workflows={(wfs ?? []).map((w) => ({ id: String(w.id), nome: String(w.nome || w.tipo || "Workflow") }))}
    />
  );
}
