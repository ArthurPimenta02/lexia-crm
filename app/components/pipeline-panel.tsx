"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ChannelIcon } from "@/app/components/channel-brand";
import { Dica } from "@/app/components/painel-ui";
import {
  ETAPA_DESCRICAO,
  ETAPA_ROTULO,
  ETAPAS,
  type Etapa,
} from "@/lib/pipeline/etapas";
import type { CartaoPipeline } from "@/lib/pipeline/read";

/**
 * O quadro do pipeline.
 *
 * Três decisões que se vêem no ecrã e que não são óbvias.
 *
 * 1. "Perdido" começa fechado. Medido a 2026-10-18: no Detail são 780 dos
 *    1012 cartões, na Miranda 330 dos 578. Aberto por omissão, a coluna que
 *    não tem nada para fazer era a maior do quadro e empurrava as outras
 *    cinco para fora da vista.
 *
 * 2. As colunas rolam na horizontal e cada uma rola na vertical por sua
 *    conta. Com a página a rolar inteira, os títulos das colunas saíam do
 *    ecrã ao fim de dez cartões e deixava de se saber o que se estava a ler.
 *
 * 3. Cada cartão diz, em texto, porque é que está naquela coluna. A etapa é
 *    calculada e não arrastada à mão, por isso a pergunta "porque é que este
 *    está aqui?" aparece sempre — e a resposta tem de estar no cartão, não
 *    numa página de ajuda.
 */

const corDaEtapa: Record<Etapa, string> = {
  a_arrefecer: "bg-amber-500",
  a_decorrer: "bg-sky-500",
  agendado: "bg-emerald-500",
  cliente: "bg-violet-500",
  perdido: "bg-muted-foreground/40",
  por_responder: "bg-red-500",
};

function Cartao({
  cartao,
  timeZone,
}: {
  cartao: CartaoPipeline;
  timeZone: string;
}) {
  const marcacao = cartao.marcacaoEm
    ? new Intl.DateTimeFormat("pt-PT", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "2-digit",
        timeZone,
      }).format(new Date(cartao.marcacaoEm))
    : null;

  /*
   * O nome da marcação ganha ao nome do contacto.
   *
   * O nome do contacto é o do perfil de WhatsApp, escolhido pela própria
   * pessoa, e muitas vezes não é um nome: o cartão do Izaías de Freitas
   * Estevam aparecia como "Out Of Service" e o do Stevan J Torres como "The
   * Blessed⚡️". Quem olhava para o quadro não reconhecia ninguém e
   * concluía que a marcação estava no cartão errado.
   *
   * O nome do perfil não se perde — desce para a segunda linha, ao lado do
   * telefone, porque é por ele que a conversa se encontra no WhatsApp.
   */
  const titulo =
    cartao.marcacaoNome ?? cartao.nome ?? cartao.telefone ?? "Sem nome";
  const alcunha = cartao.marcacaoNome && cartao.nome ? cartao.nome : null;
  const segundaLinha =
    [alcunha, titulo === cartao.telefone ? null : cartao.telefone]
      .filter(Boolean)
      .join(" · ") || null;

  return (
    <Link
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
      href={`/app/conversas?conversa=${encodeURIComponent(cartao.identificadorConversa)}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <ChannelIcon channel={cartao.canal} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {titulo}
          </p>
          {segundaLinha ? (
            <p className="truncate text-xs text-muted-foreground">
              {segundaLinha}
            </p>
          ) : null}
        </div>
      </div>

      {marcacao ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="min-w-0 truncate text-xs font-semibold text-emerald-700">
            {marcacao}
            {cartao.marcacaoServico ? ` · ${cartao.marcacaoServico}` : ""}
          </p>
          {/*
            Quem marcou é a primeira pergunta de quem abre este quadro, e a
            resposta não se adivinha pelo título: medido a 2026-10-18, 83% dos
            eventos das agendas foram escritos à mão.
          */}
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              cartao.marcacaoOrigem === "agente"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {cartao.marcacaoOrigem === "agente" ? "Agente" : "À mão"}
          </span>
        </div>
      ) : null}

      <p className="text-xs leading-snug text-muted-foreground">
        {cartao.porque}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {/*
          O aviso viaja com o cartão em vez de o prender à coluna "Por
          responder". Quem agendou aparece em "Agendado", que é onde o dono o
          vai procurar, e continua a ver a vermelho que ainda ninguém lhe
          respondeu.
        */}
        {cartao.porResponder && cartao.etapa !== "por_responder" ? (
          <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            Por responder
          </span>
        ) : null}
        {cartao.resultado ? (
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {cartao.resultado}
          </span>
        ) : null}
        <span className="text-[11px] text-muted-foreground/70 tabular-nums">
          {cartao.mensagens} {cartao.mensagens === 1 ? "mensagem" : "mensagens"}
        </span>
      </div>
    </Link>
  );
}

function Coluna({
  cartoes,
  etapa,
  timeZone,
}: {
  cartoes: CartaoPipeline[];
  etapa: Etapa;
  timeZone: string;
}) {
  return (
    // A altura é travada aqui e não herdada do layout: o `<main>` já rola, e
    // sem um tecto a coluna crescia com os seus 780 cartões e levava o título
    // consigo para fora do ecrã.
    <section className="flex max-h-[70dvh] w-72 shrink-0 flex-col rounded-2xl border border-border bg-surface-muted/60">
      <header className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${corDaEtapa[etapa]}`}
        />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {ETAPA_ROTULO[etapa]}
        </h2>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
          {cartoes.length}
        </span>
        <Dica texto={ETAPA_DESCRICAO[etapa]} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cartoes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Nada aqui.
          </p>
        ) : (
          cartoes.map((cartao) => (
            <Cartao cartao={cartao} key={cartao.id} timeZone={timeZone} />
          ))
        )}
      </div>
    </section>
  );
}

export function PipelinePanel({
  cartoes,
  timeZone,
}: {
  cartoes: CartaoPipeline[];
  timeZone: string;
}) {
  const [busca, setBusca] = useState("");
  const [mostrarPerdidos, setMostrarPerdidos] = useState(false);

  const colunas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    const visiveis = cartoes.filter((cartao) => {
      if (!termo) {
        return true;
      }

      const nome = (cartao.nome ?? "").toLowerCase();
      const telefone = (cartao.telefone ?? "").replace(/\D/g, "");

      return (
        nome.includes(termo) ||
        (digitos.length > 0 && telefone.includes(digitos))
      );
    });

    return ETAPAS.filter(
      (etapa) => etapa !== "perdido" || mostrarPerdidos,
    ).map((etapa) => ({
      cartoes: visiveis.filter((cartao) => cartao.etapa === etapa),
      etapa,
    }));
  }, [busca, cartoes, mostrarPerdidos]);

  const perdidos = cartoes.filter((cartao) => cartao.etapa === "perdido").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Procurar por nome ou telefone"
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-border-strong focus:outline-none sm:max-w-xs"
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Procurar por nome ou telefone"
          type="search"
          value={busca}
        />

        <button
          aria-pressed={mostrarPerdidos}
          className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition ${
            mostrarPerdidos
              ? "border-foreground bg-primary text-primary-foreground"
              : "border-border bg-surface text-muted-foreground hover:border-border-strong"
          }`}
          onClick={() => setMostrarPerdidos((anterior) => !anterior)}
          type="button"
        >
          {mostrarPerdidos ? "Esconder perdidos" : `Ver perdidos (${perdidos})`}
        </button>
      </div>

      {/*
        As margens negativas deixam o quadro rolar de borda a borda do ecrã.
        Dentro do contentor do layout, que tem padding, a última coluna ficava
        a meio e parecia que o quadro acabava ali.
      */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
        {colunas.map(({ cartoes: daColuna, etapa }) => (
          <Coluna
            cartoes={daColuna}
            etapa={etapa}
            key={etapa}
            timeZone={timeZone}
          />
        ))}
      </div>
    </div>
  );
}
