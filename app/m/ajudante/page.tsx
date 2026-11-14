import { contextoMovel } from "@/lib/movel/contexto";

import { ConversaAjudante } from "./conversa";

export const dynamic = "force-dynamic";

/** Analista Lexia no iPhone (o mesmo do painel do computador). */
export default async function AjudanteMovel({ searchParams }: { searchParams: Promise<{ tela?: string }> }) {
  const c = (await contextoMovel())!;
  const { t } = c;
  const tela = (await searchParams).tela;
  return (
    <ConversaAjudante
      sugestoes={[t("Como foi esta semana?"), t("Quem está esperando resposta?"), t("Qual campanha está trazendo mais leads?"), t("Escreva uma resposta para quem espera há mais tempo")]}
      tela={typeof tela === "string" && tela.startsWith("/m") ? tela.slice(0, 80) : undefined}
      textos={{
        aPensar: t("Pensando…"), cliente: t("Cliente"), conversas: t("Conversas"), desligado: t("O Analista Lexia ainda não está ligado."),
        enviada: t("Enviada ✓"), enviando: t("Enviando…"), enviar: t("Enviar"), erro: t("Não consegui responder agora. Tente de novo."),
        falhou: t("O envio falhou."), mensagemPara: t("Mensagem para {nome}"), nova: t("Nova conversa"), pergunte: t("Pergunte à Lexia"),
        semConversas: t("Ainda não há conversas."), sub: c.clienteNome, titulo: t("Analista Lexia"),
        verConversa: t("Ver conversa"), voltar: t("Voltar"),
      }}
    />
  );
}
