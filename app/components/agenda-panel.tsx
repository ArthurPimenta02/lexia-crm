import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";

import type { AgendaResultado, EventoAgenda } from "@/lib/agenda/read";

/**
 * A semana — ou o mês — do dono.
 *
 * As duas vistas respondem a perguntas diferentes e por isso mostram coisas
 * diferentes. A semana é para trabalhar: cabe o serviço, o sítio e o link, e
 * é onde se vê o dia a dia. O mês é para ter noção do todo — onde estão os
 * buracos, que semana está cheia — e aí só cabe a hora e o nome.
 *
 * O tecto de quatro eventos por célula no mês é medido, não inventado: a
 * 2026-10-18, dos 179 dias com marcações nos dois clientes, só 5 passavam dos
 * quatro (o pico é 7 no Detail e 5 na Miranda). Com esse tecto, 97% dos dias
 * mostram tudo e o resto remete para a semana, onde cabe.
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
 * A navegação é por links e não por estado no navegador. A semana vive no
 * endereço, por isso uma semana concreta pode ser guardada nos favoritos ou
 * mandada a alguém, e o botão de voltar faz o que se espera.
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

/**
 * O dia já vem como `AAAA-MM-DD` calculado no fuso do cliente, por isso
 * formata-se em UTC de propósito: se se voltasse a aplicar um fuso aqui, o
 * dia deslizava uma segunda vez.
 */
function lerDia(chave: string) {
  const [ano, mes, dia] = chave.split("-").map(Number);

  return new Date(Date.UTC(ano, mes - 1, dia));
}

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
 * O evento como cabe numa célula do mês: uma linha só.
 *
 * O crachá "Agente" não cabe aqui, por isso a origem passa a ser a bolinha —
 * cheia quando foi o agente, vazada quando foi à mão. É a mesma informação
 * com um vigésimo da largura, e a legenda por baixo da grelha diz qual é qual.
 */
function EventoCompacto({
  evento,
  timeZone,
}: {
  evento: EventoAgenda;
  timeZone: string;
}) {
  const doAgente = evento.origem === "agente";
  const titulo = evento.nomeCliente ?? evento.titulo ?? "Sem título";
  const hora = evento.diaInteiro
    ? null
    : new Intl.DateTimeFormat("pt-PT", {
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        timeZone,
      }).format(new Date(evento.inicio));

  const conteudo = (
    <>
      <span
        aria-hidden="true"
        className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
          doAgente ? "bg-primary" : "border border-muted-foreground/60"
        }`}
      />
      {hora ? (
        <span className="shrink-0 font-semibold tabular-nums">{hora}</span>
      ) : null}
      <span className="truncate">{titulo}</span>
    </>
  );

  const classe =
    "flex w-full items-start gap-1 rounded-md px-1 py-0.5 text-left text-[11px] leading-tight text-foreground";

  if (!evento.linkGoogle) {
    return <span className={classe}>{conteudo}</span>;
  }

  return (
    <a
      className={`${classe} transition hover:bg-muted`}
      href={evento.linkGoogle}
      rel="noreferrer noopener"
      target="_blank"
      title={`${hora ? `${hora} · ` : ""}${titulo}${
        evento.servico ? ` · ${evento.servico}` : ""
      } · ${doAgente ? "marcado pelo agente" : "marcado à mão"}`}
    >
      {conteudo}
    </a>
  );
}

function Botao({
  activo,
  children,
  href,
}: {
  activo?: boolean;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      aria-current={activo ? "page" : undefined}
      className={`inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition ${
        activo
          ? "border-foreground bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-border-strong"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}

/** Quantos eventos cabem numa célula do mês antes de aparecer o "+N mais". */
const CABEM_NO_DIA = 4;

function GrelhaMes({
  agenda,
  linkDoDia,
  timeZone,
}: {
  agenda: AgendaResultado;
  linkDoDia: (chave: string) => string;
  timeZone: string;
}) {
  return (
    // A grelha não encolhe abaixo dos 56rem: sete colunas num telemóvel de
    // 375px davam 53px cada, onde não cabe uma hora e um nome. Em vez de
    // espremer, rola na horizontal — tal como a vista de semana.
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
      <div className="min-w-[56rem]">
        <div className="grid grid-cols-7 gap-1.5">
          {agenda.dias.slice(0, 7).map((dia) => (
            <p
              className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              key={`cabecalho-${dia.chave}`}
            >
              {diaDaSemanaFormatter.format(lerDia(dia.chave)).replace(".", "")}
            </p>
          ))}

          {agenda.dias.map((dia) => {
            const visiveis = dia.eventos.slice(0, CABEM_NO_DIA);
            const escondidos = dia.eventos.length - visiveis.length;

            return (
              <section
                className={`flex min-h-[7rem] flex-col rounded-xl border p-1.5 ${
                  dia.hoje
                    ? "border-foreground bg-surface"
                    : dia.foraDoPeriodo
                      ? "border-border/60 bg-surface-muted/30"
                      : "border-border bg-surface"
                }`}
                key={dia.chave}
              >
                <Link
                  className={`mb-1 self-start rounded-md px-1 text-xs font-semibold tabular-nums transition hover:bg-muted ${
                    dia.hoje
                      ? "bg-primary text-primary-foreground hover:bg-primary"
                      : dia.foraDoPeriodo
                        ? "text-muted-foreground/50"
                        : "text-foreground"
                  }`}
                  href={linkDoDia(dia.chave)}
                  title={`Ver a semana de ${dia.chave}`}
                >
                  {Number(dia.chave.slice(8))}
                </Link>

                <div className="flex min-w-0 flex-col gap-0.5">
                  {visiveis.map((evento) => (
                    <EventoCompacto
                      evento={evento}
                      key={evento.id}
                      timeZone={timeZone}
                    />
                  ))}

                  {escondidos > 0 ? (
                    <Link
                      className="rounded-md px-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      href={linkDoDia(dia.chave)}
                    >
                      +{escondidos} mais
                    </Link>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Botao href={ligacao({ dia: agenda.anterior })}>←</Botao>
        <Botao href={ligacao({})}>Hoje</Botao>
        <Botao href={ligacao({ dia: agenda.proximo })}>→</Botao>

        <p className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold text-foreground capitalize">
          {rotuloDoPeriodo(agenda)}
        </p>

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
        O filtro só aparece quando há mais do que uma pessoa na semana. Na
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
        <>
          <GrelhaMes
            agenda={agenda}
            linkDoDia={(chave) => ligacao({ dia: chave, vista: "semana" })}
            timeZone={timeZone}
          />

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
            <span>Carrega no número do dia para abrir essa semana.</span>
          </p>
        </>
      ) : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
          {agenda.dias.map((dia) => {
            const data = lerDia(dia.chave);

            return (
              <section
                className={`flex max-h-[70dvh] w-56 shrink-0 flex-col rounded-2xl border ${
                  dia.hoje
                    ? "border-foreground bg-surface"
                    : "border-border bg-surface-muted/60"
                }`}
                key={dia.chave}
              >
                <header className="flex shrink-0 items-baseline gap-2 px-3 pt-3 pb-2">
                  <h2 className="text-sm font-semibold text-foreground capitalize">
                    {diaDaSemanaFormatter.format(data).replace(".", "")}
                  </h2>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {diaDoMesFormatter.format(data)}
                  </p>
                  {dia.eventos.length > 0 ? (
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                      {dia.eventos.length}
                    </span>
                  ) : null}
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {dia.eventos.length === 0 ? (
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
      )}

      <p className="flex items-start gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Esta é a tua agenda do Google, espelhada aqui de 15 em 15 minutos.
          Para marcar, mudar a hora ou desmarcar, carrega no evento e abre no
          Google — é de lá que o agente lê a disponibilidade, e marcar só aqui
          punha-o a oferecer a mesma hora a outra pessoa.
        </span>
      </p>
    </div>
  );
}
