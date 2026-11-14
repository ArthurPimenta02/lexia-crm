import { notFound } from "next/navigation";

import { contextoMovel } from "@/lib/movel/contexto";
import { lerConversa } from "@/lib/movel/conversas";
import { iniciais, partesNoFuso } from "@/lib/movel/formato";
import { isValidConversationId } from "@/lib/redis/agent-locks";

import { Chat } from "./chat";

export const dynamic = "force-dynamic";

export default async function ConversaMovel({ params }: { params: Promise<{ conversa: string }> }) {
  const c = (await contextoMovel())!;
  const conversa = decodeURIComponent((await params).conversa);
  if (!isValidConversationId(conversa)) notFound();

  const d = await lerConversa(c.clienteSlug, conversa).catch(() => null);
  if (!d) notFound();

  const t = c.t;
  const canal = d.canal === "whatsapp" ? "WhatsApp" : d.canal === "instagram" ? "Instagram" : "Messenger";
  const temperatura = d.temperatura === "quente" ? t("quente") : d.temperatura === "morno" ? t("morno") : d.temperatura === "frio" ? t("frio") : null;
  return (
    <Chat
      inicial={{
        canal: d.canal,
        conversa: d.conversa,
        esperaDesde: d.esperaDesde,
        estado: d.estado,
        ficha: `/m/conversas/${encodeURIComponent(d.conversa)}/ficha`,
        iniciais: iniciais(d.nome || "?"),
        mensagens: d.mensagens,
        nome: d.nome || (d.canal === "instagram" ? t("Cliente do Instagram") : d.canal === "messenger" ? t("Cliente do Messenger") : t("Cliente")),
        quente: d.temperatura === "quente",
        subtitulo: canal,
        telefone: d.telefone,
        temperatura,
        ultimaRecebida: d.ultimaRecebida,
      }}
      hoje={partesNoFuso(new Date(), c.fuso).chave}
      fuso={c.fuso}
      locale={c.locale}
      textos={{
        agente: t("Agente"),
        agenteResponde: t("Agente respondendo"),
        anexar: t("Anexar"),
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
        estaConsigo: t("Com você"),
        ficha: t("Ficha do cliente"),
        galeria: t("Galeria"),
        gravando: t("Gravando…"),
        hoje: t("Hoje"),
        ligar: t("Ligar"),
        mensagem: t("Mensagem"),
        ontem: t("Ontem"),
        semMicrofone: t("Não foi possível usar o microfone. Verifique a permissão nos Ajustes do iPhone."),
        semMensagens: t("Sem mensagens."),
        voltar: t("Voltar"),
      }}
    />
  );
}
