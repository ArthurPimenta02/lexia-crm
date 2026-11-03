"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { BotaoExportar } from "@/app/components/botao-exportar";
import { ChannelIcon } from "@/app/components/channel-brand";
import { useIdioma } from "@/app/components/idioma";
import { Dica } from "@/app/components/painel-ui";
import { colunasDoPipeline } from "@/lib/exportar/colunas";
import type { FuncaoT } from "@/lib/i18n/traduzir";
import { ETAPAS, type Etapa } from "@/lib/pipeline/etapas";
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
  a_arrefecer: "bg-warning",
  a_decorrer: "bg-info",
  agendado: "bg-positive",
  // Não há token para "cliente": é a única coluna sem cor de estado, e o
  // violeta lê-se nos dois modos por ser só uma bolinha sobre a superfície.
  cliente: "bg-violet-500",
  perdido: "bg-muted-foreground/40",
  por_responder: "bg-danger",
};

/*
 * Os nomes e as descrições das colunas traduzem-se aqui, no sítio onde se
 * desenham, e não em `lib/pipeline/etapas.ts`: esse ficheiro também alimenta a
 * exportação para CSV, que é de outra área.
 */
function rotuloDaEtapa(etapa: Etapa, t: FuncaoT) {
  switch (etapa) {
    case "a_arrefecer":
      return t("Esfriando");
    case "a_decorrer":
      return t("Em andamento");
    case "agendado":
      return t("Agendado");
    case "cliente":
      return t("Cliente");
    case "perdido":
      return t("Perdido");
    case "por_responder":
      return t("Por responder");
  }
}

function descricaoDaEtapa(etapa: Etapa, t: FuncaoT) {
  switch (etapa) {
    case "a_arrefecer":
      return t(
        "Sem conversa há mais de uma semana e ainda dentro do mês. Ainda dá para recuperar.",
      );
    case "a_decorrer":
      return t("A conversa está ativa e a bola está com a gente.");
    case "agendado":
      return t("Tem um agendamento por acontecer.");
    case "cliente":
      return t("Já foi atendido. Aqui se ganha a recompra.");
    case "perdido":
      return t("Um mês sem dizer nada. Fica fora da vista até alguém procurar.");
    case "por_responder":
      return t(
        "Escreveram e ainda ninguém respondeu. Quem já tem agendamento fica em Agendado, com o aviso vermelho no cartão.",
      );
  }
}

/**
 * Porque é que o cartão está na coluna, no idioma de quem vê.
 *
 * O `cartao.porque` vem em português de `derivarEtapa`, que é partilhado com a
 * exportação. Refaz-se aqui a mesma frase a partir dos mesmos factos (etapa,
 * dias, à espera de resposta) — são as mesmas regras de `derivarEtapa`.
 */
function porqueDoCartao(cartao: CartaoPipeline, t: FuncaoT) {
  const { dias } = cartao;
  const semResposta =
    dias === 0
      ? t("Escreveu hoje e ainda não teve resposta.")
      : dias === 1
        ? t("Escreveu há 1 dia e ainda não teve resposta.")
        : t("Escreveu há {n} dias e ainda não teve resposta.", { n: dias });

  switch (cartao.etapa) {
    case "agendado":
      return cartao.porResponder
        ? `${t("Tem um agendamento por acontecer.")} ${semResposta}`
        : t("Tem um agendamento por acontecer.");
    case "por_responder":
      return semResposta;
    case "a_decorrer":
      return t("A conversa está ativa.");
    case "cliente":
      return t("Já foi atendido.");
    case "a_arrefecer":
      return t("Sem conversa há {n} dias.", { n: dias });
    case "perdido":
      return cartao.ultimaMensagemEm
        ? t("Sem conversa há {n} dias.", { n: dias })
        : t("Nunca trocou mensagens.");
  }
}

/** A etiqueta da IA já vem rotulada em `RESULTADO_ROTULO`; traduz-se aqui. */
function rotuloDoResultado(rotulo: string, t: FuncaoT) {
  switch (rotulo) {
    case "Falou em marcar":
      return t("Falou em agendar");
    case "Por apurar":
      return t("A verificar");
    case "Passou para a equipa":
      return t("Passou para a equipe");
    case "Interessado":
      return t("Interessado");
    case "Perdido":
      return t("Perdido");
    case "Pós-venda":
      return t("Pós-venda");
    case "Sem desfecho":
      return t("Sem desfecho");
    default:
      return rotulo;
  }
}

function Cartao({
  cartao,
  timeZone,
}: {
  cartao: CartaoPipeline;
  timeZone: string;
}) {
  const { locale, t } = useIdioma();
  const marcacao = cartao.marcacaoEm
    ? new Intl.DateTimeFormat(locale, {
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
    cartao.marcacaoNome ?? cartao.nome ?? cartao.telefone ?? t("Sem nome");
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
          <p className="min-w-0 truncate text-xs font-semibold text-positive">
            {marcacao}
            {cartao.marcacaoServico ? ` · ${cartao.marcacaoServico}` : ""}
          </p>
          {/*
            Quem marcou é a primeira pergunta de quem abre este quadro, e a
            resposta não se adivinha pelo título: medido a 2026-10-18, 83% dos
            eventos das agendas foram escritos à mão.
          */}
          <span
            className={`ds-selo shrink-0 ${
              cartao.marcacaoOrigem === "agente"
                ? "ds-selo-escuro"
                : "ds-selo-neutro"
            }`}
          >
            {cartao.marcacaoOrigem === "agente" ? t("Agente") : t("Manual")}
          </span>
        </div>
      ) : null}

      <p className="text-xs leading-snug text-muted-foreground">
        {porqueDoCartao(cartao, t)}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {/*
          O aviso viaja com o cartão em vez de o prender à coluna "Por
          responder". Quem agendou aparece em "Agendado", que é onde o dono o
          vai procurar, e continua a ver a vermelho que ainda ninguém lhe
          respondeu.
        */}
        {cartao.porResponder && cartao.etapa !== "por_responder" ? (
          // Fica a vermelho fixo e não no token `danger`: o teste
          // `pipeline-etapas` procura esta etiqueta pela classe `bg-red-500`
          // com `text-white`, e o vermelho cheio lê-se nos dois modos.
          <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            {t("Por responder")}
          </span>
        ) : null}
        {cartao.resultado ? (
          <span className="ds-selo ds-selo-neutro">
            {rotuloDoResultado(cartao.resultado, t)}
          </span>
        ) : null}
        <span className="text-[11px] text-muted-foreground/70 tabular-nums">
          {cartao.mensagens === 1
            ? t("1 mensagem")
            : t("{n} mensagens", { n: cartao.mensagens })}
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
  const { t } = useIdioma();

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
          {rotuloDaEtapa(etapa, t)}
        </h2>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
          {cartoes.length}
        </span>
        <Dica texto={descricaoDaEtapa(etapa, t)} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cartoes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {t("Nada aqui.")}
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
  const { t } = useIdioma();
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

  // Exactamente o que está no quadro, pela ordem do quadro: com a procura
  // aplicada, e com os perdidos só se estiverem abertos. Achatar as colunas
  // em vez de refiltrar os cartões faz o ficheiro sair agrupado por coluna,
  // que é como a pessoa está a olhar para eles.
  const paraExportar = colunas.flatMap(({ cartoes: daColuna }) => daColuna);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={t("Buscar por nome ou telefone")}
          className="ds-campo min-w-0 flex-1 sm:max-w-xs"
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder={t("Buscar por nome ou telefone")}
          type="search"
          value={busca}
        />

        <button
          aria-pressed={mostrarPerdidos}
          className={`ds-botao shrink-0 ${
            mostrarPerdidos ? "ds-botao-primario" : "ds-botao-secundario"
          }`}
          onClick={() => setMostrarPerdidos((anterior) => !anterior)}
          type="button"
        >
          {mostrarPerdidos
            ? t("Ocultar perdidos")
            : t("Ver perdidos ({n})", { n: perdidos })}
        </button>

        <BotaoExportar
          assunto="pipeline"
          colunas={colunasDoPipeline(timeZone)}
          linhas={paraExportar}
        />
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
