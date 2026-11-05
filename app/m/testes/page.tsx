import { contextoMovel } from "@/lib/movel/contexto";
import { partesNoFuso } from "@/lib/movel/formato";
import { createAdminClient } from "@/lib/supabase/admin";

import { COLUNAS_EXECUCAO, type ExecucaoTeste } from "./bolhas";
import { ChatTeste } from "./chat-teste";

export const dynamic = "force-dynamic";

/**
 * Área de testes no iPhone: o dono fala com o agente da empresa dele como se
 * fosse um cliente. Abre na última conversa de teste da empresa (a mesma que o
 * painel do computador mostra) e nunca manda nada a um cliente real.
 */
export default async function TestesMovel() {
  const c = (await contextoMovel())!;
  const t = c.t;
  const origem = c.admin ? "painel_admin" : "painel_cliente";
  const base = createAdminClient();

  const [{ data: wfs }, { data: sessoes }] = await Promise.all([
    base.from("lexia_workflows").select("id, nome, tipo").eq("cliente_slug", c.clienteSlug).eq("status", "ativo").order("nome", { ascending: true }),
    base.from("lexia_testes_sessoes").select("session_id").eq("cliente_slug", c.clienteSlug).eq("origem", origem).order("criado_em", { ascending: false }).limit(1),
  ]);
  const sessao = (sessoes?.[0]?.session_id as string | undefined) ?? null;

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
