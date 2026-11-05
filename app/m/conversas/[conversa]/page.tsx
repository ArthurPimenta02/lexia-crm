import { notFound } from "next/navigation";

import { contextoMovel } from "@/lib/movel/contexto";
import { lerConversa } from "@/lib/movel/conversas";
import { corDe, iniciais, partesNoFuso } from "@/lib/movel/formato";
import { isValidConversationId } from "@/lib/redis/agent-locks";
import { telefoneLegivel } from "@/lib/movel/conversas";

import { Chat } from "./chat";

export const dynamic = "force-dynamic";

export default async function ConversaMovel({ params }: { params: Promise<{ conversa: string }> }) {
  const c = (await contextoMovel())!;
  const conversa = decodeURIComponent((await params).conversa);
  if (!isValidConversationId(conversa)) notFound();

  const d = await lerConversa(c.clienteSlug, conversa).catch(() => null);
  if (!d) notFound();

  const t = c.t;
  return (
    <Chat
      inicial={{
        canal: d.canal,
        conversa: d.conversa,
        cor: corDe(d.conversa),
        estado: d.estado,
        iniciais: iniciais(d.nome),
        mensagens: d.mensagens,
        nome: d.nome,
        telefone: d.telefone,
        telefoneLegivel: telefoneLegivel(d.telefone),
        ultimaRecebida: d.ultimaRecebida,
      }}
      hoje={partesNoFuso(new Date(), c.fuso).chave}
      fuso={c.fuso}
      locale={c.locale}
      textos={{
        agente: t("Agente"),
        agenteResponde: t("O agente está respondendo"),
        agenteRespondeSub: t("Toque em Assumir para responder você mesmo"),
        assumir: t("Assumir"),
        audio: t("Áudio"),
        audioIndisponivel: t("Áudio (não disponível)"),
        fotoIndisponivel: t("Foto (não disponível)"),
        videoIndisponivel: t("Vídeo (não disponível)"),
        camara: t("Câmera"),
        cancelar: t("Cancelar"),
        devolver: t("Devolver ao agente"),
        documento: t("Documento"),
        enviar: t("Enviar"),
        erroEnvio: t("Não foi enviada. Toque para tentar de novo."),
        estaConsigo: t("Está com você"),
        estaConsigoSub: t("O agente pausou nesta conversa"),
        foraJanela: t("Passaram mais de 24 h desde a última mensagem do cliente: a Meta pode recusar o envio."),
        galeria: t("Galeria"),
        gravando: t("Gravando…"),
        hoje: t("Hoje"),
        mensagem: t("Mensagem"),
        ontem: t("Ontem"),
        semMicrofone: t("Não foi possível usar o microfone. Verifique a permissão nos Ajustes do iPhone."),
        semMensagens: t("Sem mensagens."),
        voltar: t("Voltar"),
      }}
    />
  );
}
