"use client";

import { ExternalLink, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type {
  AgendaResultado,
  DiaAgenda,
  EventoAgenda,
} from "@/lib/agenda/read";

/**
 * A semana — ou o mês — do dono.
 *
 * As duas vistas respondem a perguntas diferentes. A semana é para trabalhar:
 * cabe o serviço, o sítio e o link, e é onde se vê o dia a dia. O mês é para
 * ter noção do todo — onde estão os buracos, que semana está cheia.
 *
 * O detalhe vive todo no painel do dia
 * ------------------------------------
 * Carregar num dia abre o painel com os atendimentos desse dia por inteiro,
 * nas duas vistas. Isso resolve um problema que a grelha sozinha não resolve:
 * nenhuma célula de mês tem largura para a hora, o nome, o serviço, o sítio e
 * o link, e num telemóvel nem para o nome. Em vez de encolher o texto até
 * deixar de se ler, a célula mostra só o suficiente para procurar e o painel
 * mostra tudo para decidir.
 *
 * É também por isso que os eventos dentro da grelha do mês não são links: a
 * célula inteira é o botão que abre o painel, e um link dentro de um botão não
 * é HTML válido nem se consegue acertar com o dedo numa linha de 11px.
 *
 * O mês cabe no ecrã, mesmo ao telemóvel
 * --------------------------------------
 * Sete colunas num ecrã de 375px dão 45px cada. Nessa largura não cabe texto,
 * por isso ao telemóvel os eventos de cada dia são bolinhas — cheias quando
 * foi o agente, vazadas quando foi à mão — e o número de cada dia é um círculo
 * como no Google. A partir do `sm:` há largura para a hora e o nome, e as
 * bolinhas dão lugar a linhas de texto.
 *
 * Rolar na horizontal era a alternativa e foi recusada de propósito: num mês,
 * a pergunta é "onde é que há espaço?", e uma vista que só mostra quatro dias
 * de cada vez não responde a essa pergunta.
 *
 * A semana, ao telemóvel, empilha os dias de cima para baixo em vez de rolar
 * para o lado. A partir do `sm:` volta a ser um quadro de sete colunas, onde
 * cada cartão tem os seus 224px — é a única das duas vistas em que o texto
 * completo vale mais do que ver os sete dias ao mesmo tempo.
 *
 * O tecto de quatro eventos por célula no mês é medido, não inventado: a
 * 2026-10-18, dos 179 dias com marcações nos dois clientes, só 5 passavam dos
 * quatro (o pico é 7 no Detail e 5 na Miranda). Com esse tecto, 97% dos dias
 * mostram tudo e o resto diz quantos faltam.
 *
 * Porque é que isto não deixa editar
 * -----------------------------------
 * A fonte da verdade das marcações é o Google, não esta tabela. São as
 * agendas do Google que os agentes de IA consultam para saber se uma hora
 * está livre, nos dois clientes. Gravar aqui uma marcação que o Google não
 * conhece punha o agente a oferecer a mesma hora a outra pessoa — e o erro
 * só aparecia quando as duas chegassem à porta.
 *
 * Por isso cada evento leva o link para o Google, que é onde se altera. Não é
 * um remendo: é a única forma correcta enquanto não houver uma conta de
 * serviço do Google que deixe o painel escrever lá primeiro.
 *
 * A navegação entre períodos é por links e não por estado no navegador: o
 * período vive no endereço, por isso uma semana concreta pode ser guardada nos
 * favoritos ou mandada a alguém, e o botão de voltar faz o que se espera. O
 * painel do dia é que é estado — é uma leitura de passagem, e um endereço que
 * abrisse um painel por cima da grelha não é nada que se queira guardar.
 */

const diaDaSemanaFormatter = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "UTC",
  weekday: "short",
});

const diaDoMesFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

const dataLongaFormatter = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
});

/**
 * O dia já vem como `AAAA-MM-DD` calculado no fuso do cliente, por isso
 * formata-se em UTC de propósito: se se voltasse a aplicar um fuso aqui, o
 * dia deslizava uma segunda vez.
 */
function lerDia(chave: string) {
  const [ano, mes, dia] = chave.split("-").map(Number);

  return new Date(Date.UTC(ano, mes - 1, dia));
}

const diaDaSemana = (chave: string) =>
  diaDaSemanaFormatter.format(lerDia(chave)).replace(".", "");

const mesEAno = (d: Date) =>
  new Intl.DateTimeFormat("pt-PT", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(d);

function rotuloDoPeriodo(agenda: AgendaResultado) {
  const inicio = lerDia(agenda.inicio);

  if (agenda.vista === "mes") {
    return mesEAno(inicio);
  }

  const fim = new Date(inicio.getTime() + 6 * 24 * 60 * 60 * 1000);
  const mesmoMes = inicio.getUTCMonth() === fim.getUTCMonth();

  const dia = (d: Date) =>
    new Intl.DateTimeFormat("pt-PT", {
      day: "numeric",
      month: mesmoMes ? undefined : "short",
      timeZone: "UTC",
    }).format(d);

  return `${dia(inicio)} – ${dia(fim)} de ${mesEAno(fim)}`;
}

function horas(evento: EventoAgenda, timeZone: string) {
  if (evento.diaInteiro) {
    return "Dia todo";
  }

  const formatar = (valor: string) =>
    new Intl.DateTimeFormat("pt-PT", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone,
    }).format(new Date(valor));

  const inicio = formatar(evento.inicio);

  return evento.fim ? `${inicio}–${formatar(evento.fim)}` : inicio;
}

/**
 * O nome do executor como se escreve.
 *
 * As duas pontas guardam-no de maneiras diferentes — o Detail em minúsculas
 * (`martim`), a Miranda já capitalizado (`Samuel`) — e nenhuma das duas é
 * para mostrar tal e qual.
 */
export function nomeExecutor(executor: string) {
  return executor.charAt(0).toUpperCase() + executor.slice(1);
}

function resumoDoDia(dia: DiaAgenda) {
  if (dia.eventos.length === 0) {
    return "Nada marcado neste dia.";
  }

  const doAgente = dia.eventos.filter(
    (evento) => evento.origem === "agente",
  ).length;

  return `${dia.eventos.length} ${
    dia.eventos.length === 1 ? "marcação" : "marcações"
  }, ${doAgente} pelo agente.`;
}

function Evento({
  evento,
  mostrarExecutor,
  moeda,
  timeZone,
}: {
  evento: EventoAgenda;
  mostrarExecutor: boolean;
  moeda: string | null;
  timeZone: string;
}) {
  const doAgente = evento.origem === "agente";
  // Um evento do agente traz nome e serviço em colunas próprias; um escrito à
  // mão só tem o título, que é o que a pessoa calhou de escrever no Google.
  const titulo = evento.nomeCliente ?? evento.titulo ?? "Sem título";

  const conteudo = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <p className="shrink-0 text-xs font-semibold text-foreground tabular-nums">
          {horas(evento, timeZone)}
        </p>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            doAgente
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {doAgente ? "Agente" : "À mão"}
        </span>
      </div>

      <p className="mt-1 line-clamp-2 text-sm leading-snug font-medium text-foreground">
        {titulo}
      </p>

      {evento.servico ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {evento.servico}
          {evento.valorPrevisto !== null && moeda
            ? ` · ${new Intl.NumberFormat("pt-PT", {
                currency: moeda,
                maximumFractionDigits: 0,
                style: "currency",
              }).format(evento.valorPrevisto)}`
            : ""}
        </p>
      ) : null}

      {evento.localizacao ? (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground/80">
          <MapPin aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span className="truncate">{evento.localizacao}</span>
        </p>
      ) : null}

      {mostrarExecutor && evento.executor ? (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {nomeExecutor(evento.executor)}
        </p>
      ) : null}
    </>
  );

  const classe = `block rounded-xl border border-border bg-surface p-2.5 ${
    doAgente ? "border-l-2 border-l-primary" : ""
  }`;

  if (!evento.linkGoogle) {
    return <div className={classe}>{conteudo}</div>;
  }

  return (
    <a
      className={`${classe} group transition hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]`}
      href={evento.linkGoogle}
      rel="noreferrer noopener"
      target="_blank"
    >
      {conteudo}
      <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60 group-hover:text-foreground">
        <ExternalLink aria-hidden="true" className="h-3 w-3" />
        Abrir no Google
      </p>
    </a>
  );
}

/**
 * O evento como cabe numa célula do mês: uma linha só, sem crachá.
 *
 * A origem passa a ser a bolinha — cheia quando foi o agente, vazada quando
 * foi à mão. É a mesma informação com um vigésimo da largura, e a legenda por
 * baixo da grelha diz qual é qual.
 */
function EventoCompacto({
  evento,
  timeZone,
}: {
  evento: EventoAgenda;
  timeZone: string;
}) {
  const titulo = evento.nomeCliente ?? evento.titulo ?? "Sem título";
  const hora = evento.diaInteiro
    ? null
    : new Intl.DateTimeFormat("pt-PT", {
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        timeZone,
      }).format(new Date(evento.inicio));

  return (
    <span className="flex w-full min-w-0 items-start gap-1 px-1 text-left text-[11px] leading-tight text-foreground">
      <Ponto doAgente={evento.origem === "agente"} />
      {hora ? (
        <span className="shrink-0 font-semibold tabular-nums">{hora}</span>
      ) : null}
      <span className="truncate">{titulo}</span>
    </span>
  );
}

function Ponto({ doAgente }: { doAgente: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
        doAgente ? "bg-primary" : "border border-muted-foreground/60"
      }`}
    />
  );
}

function Botao({
  activo,
  children,
  href,
  titulo,
}: {
  activo?: boolean;
  children: React.ReactNode;
  href: string;
  titulo?: string;
}) {
  return (
    <Link
      aria-current={activo ? "page" : undefined}
      aria-label={titulo}
      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3.5 text-sm font-semibold transition sm:h-9 ${
        activo
          ? "border-foreground bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-border-strong"
      }`}
      href={href}
      title={titulo}
    >
      {children}
    </Link>
  );
}

/** Quantos eventos cabem numa célula do mês antes de aparecer o "+N". */
const CABEM_NO_DIA = 4;

/** Quantas bolinhas cabem numa célula do mês ao telemóvel. */
const PONTOS_NO_DIA = 3;

/**
 * O painel de um dia.
 *
 * Ao telemóvel sobe de baixo e ocupa o ecrã até 85% da altura, que é o gesto
 * que se espera de um painel num telefone. A partir do `sm:` centra-se. O
 * fundo trava-se enquanto está aberto: num telemóvel, rolar a grelha por trás
 * do painel dava a sensação de que o toque não tinha sido registado.
 */
function PainelDoDia({
  dia,
  executorEscolhido,
  fechar,
  linkDaSemana,
  moeda,
  timeZone,
}: {
  dia: DiaAgenda;
  executorEscolhido: string;
  fechar: () => void;
  linkDaSemana: string | null;
  moeda: string | null;
  timeZone: string;
}) {
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        fechar();
      }
    };

    const overflowAnterior = document.body.style.overflow;

    document.addEventListener("keydown", aoTeclar);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [fechar]);

  return (
    <div
      aria-labelledby="titulo-do-dia"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={fechar}
      role="dialog"
    >
      {/*
        O clique no fundo fecha, por isso o clique dentro do painel tem de ser
        travado aqui — sem isto, carregar num evento fechava o painel antes de
        o link do Google abrir.
      */}
      <div
        className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl border border-border bg-surface shadow-xl sm:max-h-[86vh] sm:max-w-lg sm:rounded-2xl"
        onClick={(evento) => evento.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            {/*
              `first-letter:uppercase` e não `capitalize`: o pt-PT escreve
              "quinta-feira, 8 de outubro de 2026", e o `capitalize` punha
              maiúscula em cada palavra — "8 De Outubro De 2026".
            */}
            <h2
              className="text-base leading-tight font-semibold text-foreground first-letter:uppercase"
              id="titulo-do-dia"
            >
              {dataLongaFormatter.format(lerDia(dia.chave))}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {resumoDoDia(dia)}
            </p>
          </div>

          <button
            aria-label="Fechar"
            autoFocus
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={fechar}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4 sm:px-5">
          {dia.eventos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
              Dia livre.
            </p>
          ) : (
            dia.eventos.map((evento) => (
              <Evento
                evento={evento}
                key={evento.id}
                moeda={moeda}
                mostrarExecutor={executorEscolhido === ""}
                timeZone={timeZone}
              />
            ))
          )}
        </div>

        {linkDaSemana ? (
          <div className="shrink-0 border-t border-border px-4 py-3 sm:px-5">
            <Link
              className="text-sm font-semibold text-foreground underline underline-offset-4"
              href={linkDaSemana}
            >
              Ver a semana deste dia
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GrelhaMes({
  abrirDia,
  agenda,
  timeZone,
}: {
  abrirDia: (chave: string) => void;
  agenda: AgendaResultado;
  timeZone: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
      {/*
        Três letras e não o nome inteiro. O `weekday: "short"` do pt-PT dá
        "segunda" e "domingo", que numa coluna de 45px ficavam "SEGU…" — e
        "SEGU…" e "SEXT…" distinguem-se pior do que "SEG" e "SEX".
      */}
      {agenda.dias.slice(0, 7).map((dia) => (
        <p
          className="px-0.5 pb-1 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:px-1 sm:text-left sm:text-[11px]"
          key={`cabecalho-${dia.chave}`}
        >
          {diaDaSemana(dia.chave).slice(0, 3)}
        </p>
      ))}

      {agenda.dias.map((dia) => {
        const visiveis = dia.eventos.slice(0, CABEM_NO_DIA);
        const pontos = dia.eventos.slice(0, PONTOS_NO_DIA);

        return (
          <button
            className={`flex min-h-[4rem] min-w-0 flex-col items-center gap-1 rounded-lg border p-1 transition hover:border-border-strong sm:min-h-[7rem] sm:items-stretch sm:rounded-xl sm:p-1.5 ${
              dia.hoje
                ? "border-foreground bg-surface"
                : dia.foraDoPeriodo
                  ? "border-border/60 bg-surface-muted/30"
                  : "border-border bg-surface"
            }`}
            key={dia.chave}
            onClick={() => abrirDia(dia.chave)}
            title={`${diaDaSemana(dia.chave)}, ${diaDoMesFormatter.format(
              lerDia(dia.chave),
            )} — ${resumoDoDia(dia)}`}
            type="button"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums sm:h-5 sm:w-5 sm:self-start ${
                dia.hoje
                  ? "bg-primary text-primary-foreground"
                  : dia.foraDoPeriodo
                    ? "text-muted-foreground/50"
                    : "text-foreground"
              }`}
            >
              {Number(dia.chave.slice(8))}
            </span>

            {/*
              Ao telemóvel, bolinhas. A célula tem 45px e não cabe texto; o
              que cabe — e é o que se procura num mês — é quantos são e
              quais foram do agente.
            */}
            <span className="flex flex-wrap items-center justify-center gap-0.5 sm:hidden">
              {pontos.map((evento) => (
                <Ponto
                  doAgente={evento.origem === "agente"}
                  key={evento.id}
                />
              ))}
              {dia.eventos.length > pontos.length ? (
                <span className="text-[9px] leading-none font-semibold text-muted-foreground tabular-nums">
                  +{dia.eventos.length - pontos.length}
                </span>
              ) : null}
            </span>

            <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
              {visiveis.map((evento) => (
                <EventoCompacto
                  evento={evento}
                  key={evento.id}
                  timeZone={timeZone}
                />
              ))}

              {dia.eventos.length > visiveis.length ? (
                <span className="px-1 text-left text-[11px] font-semibold text-muted-foreground">
                  +{dia.eventos.length - visiveis.length} mais
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GrelhaSemana({
  abrirDia,
  agenda,
  executorEscolhido,
  moeda,
  timeZone,
}: {
  abrirDia: (chave: string) => void;
  agenda: AgendaResultado;
  executorEscolhido: string;
  moeda: string | null;
  timeZone: string;
}) {
  return (
    // Ao telemóvel empilha; a partir do `sm:` é um quadro que rola para o
    // lado, e aí as margens negativas deixam-no ir de borda a borda do ecrã.
    //
    // O `sm:items-start` é o que impede as colunas de crescerem todas até à
    // altura da mais cheia: sem ele, um dia com quatro marcações deixava os
    // outros seis como caixas de 600px quase vazias.
    <div className="flex flex-col gap-2 sm:-mx-8 sm:flex-row sm:items-start sm:gap-3 sm:overflow-x-auto sm:px-8 sm:pb-2 lg:-mx-10 lg:px-10">
      {agenda.dias.map((dia) => {
        const vazio = dia.eventos.length === 0;

        return (
          <section
            className={`flex min-w-0 flex-col rounded-2xl border sm:max-h-[70dvh] sm:w-56 sm:shrink-0 ${
              dia.hoje
                ? "border-foreground bg-surface"
                : "border-border bg-surface-muted/60"
            }`}
            key={dia.chave}
          >
            <button
              className="flex w-full shrink-0 items-baseline gap-2 rounded-2xl px-3 pt-3 pb-2 text-left transition hover:bg-muted/40"
              onClick={() => abrirDia(dia.chave)}
              type="button"
            >
              <h2 className="text-sm font-semibold text-foreground capitalize">
                {diaDaSemana(dia.chave)}
              </h2>
              <p className="text-xs text-muted-foreground tabular-nums">
                {diaDoMesFormatter.format(lerDia(dia.chave))}
              </p>

              {vazio ? (
                // Ao telemóvel um dia livre é uma linha e não um cartão: numa
                // semana calma, sete caixas a dizer "Livre" enchiam o ecrã de
                // nada e empurravam para baixo os dias que têm trabalho.
                <span className="ml-auto text-[11px] text-muted-foreground/70 sm:hidden">
                  Livre
                </span>
              ) : (
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                  {dia.eventos.length}
                </span>
              )}
            </button>

            <div
              className={`min-h-0 flex-1 flex-col gap-2 px-2 pb-2 sm:flex sm:overflow-y-auto ${
                vazio ? "hidden" : "flex"
              }`}
            >
              {vazio ? (
                <p className="rounded-xl border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground">
                  Livre
                </p>
              ) : (
                dia.eventos.map((evento) => (
                  <Evento
                    evento={evento}
                    key={evento.id}
                    moeda={moeda}
                    mostrarExecutor={executorEscolhido === ""}
                    timeZone={timeZone}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function AgendaPanel({
  agenda,
  executorEscolhido,
  moeda,
  timeZone,
}: {
  agenda: AgendaResultado;
  executorEscolhido: string;
  moeda: string | null;
  timeZone: string;
}) {
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const ligacao = ({
    dia,
    executor = executorEscolhido,
    vista = agenda.vista,
  }: {
    dia?: string;
    executor?: string;
    vista?: AgendaResultado["vista"];
  }) => {
    const params = new URLSearchParams();

    // A semana é a vista por omissão, por isso não se escreve no endereço —
    // um `/app/agenda` limpo tem de continuar a funcionar.
    if (vista !== "semana") {
      params.set("vista", vista);
    }

    if (dia) {
      params.set("dia", dia);
    }

    if (executor) {
      params.set("executor", executor);
    }

    const texto = params.toString();

    return texto ? `/app/agenda?${texto}` : "/app/agenda";
  };

  /*
   * O dia aberto guarda-se pela chave e não pelo objecto.
   *
   * Navegar para outro período troca o `agenda` por baixo deste estado. Com o
   * objecto guardado, o painel continuava a mostrar os eventos do período
   * anterior; com a chave, ou o dia existe no período novo — e o painel mostra
   * o que lá está — ou não existe e o painel fecha-se sozinho.
   */
  const dia = agenda.dias.find((candidato) => candidato.chave === diaAberto);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Botao href={ligacao({ dia: agenda.anterior })} titulo="Anterior">
            ←
          </Botao>
          <Botao href={ligacao({})}>Hoje</Botao>
          <Botao href={ligacao({ dia: agenda.proximo })} titulo="Seguinte">
            →
          </Botao>

          <p className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold text-foreground first-letter:uppercase">
            {rotuloDoPeriodo(agenda)}
          </p>
        </div>

        {/*
          A troca de vista leva o dia de referência consigo: quem está em
          outubro e carrega em "Semana" quer a semana em que está, não a
          semana do dia 1.
        */}
        <div className="flex shrink-0 items-center gap-2">
          <Botao
            activo={agenda.vista === "semana"}
            href={ligacao({ dia: agenda.diaDeReferencia, vista: "semana" })}
          >
            Semana
          </Botao>
          <Botao
            activo={agenda.vista === "mes"}
            href={ligacao({ dia: agenda.diaDeReferencia, vista: "mes" })}
          >
            Mês
          </Botao>
        </div>
      </div>

      {/*
        O filtro só aparece quando há mais do que uma pessoa no período. Na
        Miranda é sempre o Samuel, e um filtro com uma opção só é um botão
        que não faz nada.
      */}
      {agenda.executores.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Botao
            activo={executorEscolhido === ""}
            href={ligacao({ dia: agenda.inicio, executor: "" })}
          >
            Todos
          </Botao>
          {agenda.executores.map((executor) => (
            <Botao
              activo={executorEscolhido === executor}
              href={ligacao({ dia: agenda.inicio, executor })}
              key={executor}
            >
              {nomeExecutor(executor)}
            </Botao>
          ))}
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {agenda.total === 0
          ? `Nada marcado ${agenda.vista === "mes" ? "neste mês" : "nesta semana"}.`
          : `${agenda.total} ${agenda.total === 1 ? "marcação" : "marcações"}, ${agenda.marcadosPeloAgente} pelo agente.`}
      </p>

      {agenda.vista === "mes" ? (
        <GrelhaMes
          abrirDia={setDiaAberto}
          agenda={agenda}
          timeZone={timeZone}
        />
      ) : (
        <GrelhaSemana
          abrirDia={setDiaAberto}
          agenda={agenda}
          executorEscolhido={executorEscolhido}
          moeda={moeda}
          timeZone={timeZone}
        />
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-primary"
          />
          Marcado pelo agente
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full border border-muted-foreground/60"
          />
          Marcado à mão
        </span>
        <span>Carrega num dia para ver os atendimentos.</span>
      </p>

      {dia ? (
        <PainelDoDia
          dia={dia}
          executorEscolhido={executorEscolhido}
          fechar={() => setDiaAberto(null)}
          // Na semana, o dia já está à vista e o link não levava a sítio
          // nenhum. No mês, é o atalho para ver o dia com o resto da semana.
          linkDaSemana={
            agenda.vista === "mes"
              ? ligacao({ dia: dia.chave, vista: "semana" })
              : null
          }
          moeda={moeda}
          timeZone={timeZone}
        />
      ) : null}
    </div>
  );
}
