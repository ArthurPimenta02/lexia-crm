"use client";

import {
  Bot,
  CalendarCheck,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  Phone,
  Plus,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  NovaMarcacaoForm,
  type MarcarAction,
} from "@/app/components/agenda-marcar";
import { BotaoExportar } from "@/app/components/botao-exportar";
import { CartaoMetrica } from "@/app/components/cartoes";
import { useIdioma } from "@/app/components/idioma";
import {
  CabecalhoTela,
  FiltroTrilho,
  GradeMetricas,
  VazioTela,
} from "@/app/components/tela";
import type {
  AgendaResultado,
  DiaAgenda,
  EventoAgenda,
} from "@/lib/agenda/read";
import type { ContactoParaEscolha } from "@/lib/clientes/read";
import { colunasDaAgenda } from "@/lib/exportar/colunas";
import type { FuncaoT } from "@/lib/i18n/traduzir";
import type { ServicoAgendavel } from "@/lib/servicos/read";

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
 * É também por isso que os eventos dentro da grelha do mês não são links nem
 * botões: a célula inteira é o botão que abre o painel, e um botão dentro de
 * um botão não é HTML válido nem se consegue acertar com o dedo numa linha de
 * 11px. No mês o caminho é célula → painel do dia → painel do evento.
 *
 * E o detalhe de um atendimento vive no painel do evento
 * ------------------------------------------------------
 * Um cartão de evento é um botão que abre o painel do evento. Há coisas que a
 * tabela guarda e que nunca cabem num cartão de 224px — o telefone, o título
 * que a pessoa escreveu no Google quando o nome do cliente vem à parte — e é
 * aí que aparecem, com o link para o Google ao fundo.
 *
 * Os dois painéis podem estar abertos ao mesmo tempo (no mês: o do dia por
 * baixo, o do evento por cima). Por isso o `Escape` só fecha o painel que está
 * ao cimo: fechar os dois de uma vez deixava a pessoa onde não pediu para
 * estar.
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
 * Marca-se aqui, mas altera-se no Google
 * ---------------------------------------
 * A fonte da verdade das marcações é o Google, não esta tabela. São as
 * agendas do Google que os agentes de IA consultam para saber se uma hora
 * está livre, nos dois clientes. Gravar aqui uma marcação que o Google não
 * conhece punha o agente a oferecer a mesma hora a outra pessoa — e o erro só
 * aparecia quando as duas chegassem à porta.
 *
 * O painel do dia marca por isso **pelo Google primeiro**: o formulário chama
 * o workflow do n8n, que é quem tem a credencial da agenda, e só depois é que
 * esta tabela recebe o espelho da marcação. É a ordem que mantém o agente e o
 * painel a ver o mesmo.
 *
 * Desmarcar e remarcar é que continuam a viver no Google, e por isso cada
 * evento leva o link. Não é um remendo: nenhum workflow cancela nem remarca
 * hoje, e um botão aqui que não tivesse quem o atendesse do outro lado era
 * pior do que não haver botão.
 *
 * A navegação entre períodos é por links e não por estado no navegador: o
 * período vive no endereço, por isso uma semana concreta pode ser guardada nos
 * favoritos ou mandada a alguém, e o botão de voltar faz o que se espera. O
 * painel do dia é que é estado — é uma leitura de passagem, e um endereço que
 * abrisse um painel por cima da grelha não é nada que se queira guardar.
 */

/*
 * Os nomes dos dias e dos meses vêm do `Intl` no idioma de quem está a ver, e
 * não de listas escritas à mão: assim "segunda", "lunes" e "Monday" saem do
 * mesmo código.
 */
const diaDoMes = (chave: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(lerDia(chave));

const dataLonga = (chave: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
  }).format(lerDia(chave));

/**
 * O dia já vem como `AAAA-MM-DD` calculado no fuso do cliente, por isso
 * formata-se em UTC de propósito: se se voltasse a aplicar um fuso aqui, o
 * dia deslizava uma segunda vez.
 */
function lerDia(chave: string) {
  const [ano, mes, dia] = chave.split("-").map(Number);

  return new Date(Date.UTC(ano, mes - 1, dia));
}

const diaDaSemana = (chave: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short" })
    .format(lerDia(chave))
    .replace(".", "");

function rotuloDoPeriodo(agenda: AgendaResultado, locale: string) {
  const inicio = lerDia(agenda.inicio);

  if (agenda.vista === "mes") {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(inicio);
  }

  const fim = new Date(inicio.getTime() + 6 * 24 * 60 * 60 * 1000);

  // O `formatRange` junta as duas pontas como cada língua as junta — "3 – 9
  // de novembro de 2026", "November 3 – 9, 2026" — e só repete o mês quando
  // a semana passa de um para o outro.
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  })
    .formatRange(inicio, fim)
    // O Node e o Chrome põem espaços invisíveis diferentes à volta do "–"
    // (fino, sem quebra…). Sem isto o texto do servidor e o do navegador não
    // batem e o React reclama de hidratação.
    .replace(/[\u2009\u202f\u00a0]/g, " ");
}

function horas(
  evento: EventoAgenda,
  timeZone: string,
  locale: string,
  t: FuncaoT,
) {
  if (evento.diaInteiro) {
    return t("Dia inteiro");
  }

  const formatar = (valor: string) =>
    new Intl.DateTimeFormat(locale, {
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

/**
 * Quantos painéis estão abertos, e o que o fundo era antes do primeiro.
 *
 * O travão ao fundo tem de ser contado e não guardado em cada painel. Com dois
 * painéis empilhados, cada um guardava o que encontrou — o de cima encontrava
 * já `hidden` — e fechar o de cima primeiro deixava o de baixo a pensar que o
 * fundo era para ficar travado. O fundo ficava travado para sempre.
 */
let painelsAbertos = 0;
let overflowAntesDosPaineis = "";

/**
 * O que os dois painéis têm em comum: o `Escape` e o travão ao fundo.
 *
 * O fundo trava-se enquanto o painel está aberto porque, num telemóvel, rolar
 * a grelha por trás do painel dava a sensação de que o toque não tinha sido
 * registado.
 *
 * O `aoCimo` é para quando há dois painéis empilhados: ambos ouvem o teclado,
 * e sem isto um `Escape` fechava o de baixo ao mesmo tempo que o de cima.
 *
 * O nome começa por `use` e não por `usar` porque o `react-hooks` reconhece um
 * hook pelo nome: com `usarPainel` recusava-se a verificar as dependências.
 */
function usePainel(fechar: () => void, aoCimo: boolean) {
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && aoCimo) {
        fechar();
      }
    };

    document.addEventListener("keydown", aoTeclar);

    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoCimo, fechar]);

  // Sem dependências de propósito: o travão é por painel aberto, e voltar a
  // aplicá-lo a cada render só dava à conta oportunidades de se desencontrar.
  useEffect(() => {
    if (painelsAbertos === 0) {
      overflowAntesDosPaineis = document.body.style.overflow;
    }

    painelsAbertos += 1;
    document.body.style.overflow = "hidden";

    return () => {
      painelsAbertos -= 1;

      if (painelsAbertos === 0) {
        document.body.style.overflow = overflowAntesDosPaineis;
      }
    };
  }, []);
}

function resumoDoDia(dia: DiaAgenda, t: FuncaoT) {
  if (dia.eventos.length === 0) {
    return t("Nada agendado neste dia.");
  }

  const doAgente = dia.eventos.filter(
    (evento) => evento.origem === "agente",
  ).length;

  return dia.eventos.length === 1
    ? t("1 agendamento, {agente} pelo agente.", { agente: doAgente })
    : t("{n} agendamentos, {agente} pelo agente.", {
        agente: doAgente,
        n: dia.eventos.length,
      });
}

/**
 * Um evento do agente traz nome e serviço em colunas próprias; um escrito à
 * mão só tem o título, que é o que a pessoa calhou de escrever no Google.
 */
const tituloDoEvento = (evento: EventoAgenda, t: FuncaoT) =>
  evento.nomeCliente ?? evento.titulo ?? t("Sem título");

const dinheiro = (valor: number, moeda: string, locale: string) =>
  new Intl.NumberFormat(locale, {
    currency: moeda,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(valor);

function Evento({
  abrirEvento,
  evento,
  mostrarExecutor,
  moeda,
  timeZone,
}: {
  abrirEvento: (id: string) => void;
  evento: EventoAgenda;
  mostrarExecutor: boolean;
  moeda: string | null;
  timeZone: string;
}) {
  const { locale, t } = useIdioma();
  const doAgente = evento.origem === "agente";
  const titulo = tituloDoEvento(evento, t);

  return (
    // O cartão abre o painel do evento em vez de ir direito ao Google. O que
    // se quer, nove vezes em dez, é ver o telefone e o serviço — e para isso
    // sair do painel para outro separador era caro demais.
    <button
      className={`block w-full rounded-xl border border-border bg-surface p-2.5 text-left transition hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${
        doAgente ? "border-l-2 border-l-primary" : ""
      }`}
      onClick={() => abrirEvento(evento.id)}
      type="button"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="shrink-0 text-xs font-semibold text-foreground tabular-nums">
          {horas(evento, timeZone, locale, t)}
        </p>
        <span
          className={`ds-selo shrink-0 ${
            doAgente ? "ds-selo-verde" : "ds-selo-neutro"
          }`}
        >
          {doAgente ? t("Agente") : t("Manual")}
        </span>
      </div>

      <p className="mt-1 line-clamp-2 text-sm leading-snug font-medium text-foreground">
        {titulo}
      </p>

      {evento.servico ? (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {evento.servico}
          {evento.valorPrevisto !== null && moeda
            ? ` · ${dinheiro(evento.valorPrevisto, moeda, locale)}`
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
    </button>
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
  const { locale, t } = useIdioma();
  const titulo = tituloDoEvento(evento, t);
  const hora = evento.diaInteiro
    ? null
    : new Intl.DateTimeFormat(locale, {
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
      className={`ds-botao ds-botao-p min-w-9 ${
        activo ? "ds-botao-primario" : "ds-botao-secundario"
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
 * O que o painel do dia precisa para deixar marcar. `null` quando não dá —
 * quando o cliente não tem catálogo de agendamento, ou quando a porta para o
 * n8n ainda não está configurada.
 */
export type MarcarNaAgenda = {
  action: MarcarAction;
  contactos: ContactoParaEscolha[];
  servicos: ServicoAgendavel[];
};

/**
 * Marcar sem ter de abrir um dia primeiro.
 *
 * O botão do painel do dia continua a existir e serve para outra coisa: lá, o
 * dia já está escolhido. Este abre com o dia de referência do período que está
 * à vista, e o formulário tem o campo do dia para se mudar — é o caminho de
 * quem chega à agenda já a saber que quer marcar.
 */
function PainelDeMarcar({
  dia,
  fechar,
  marcar,
  moeda,
  timeZone,
}: {
  dia: string;
  fechar: () => void;
  marcar: MarcarNaAgenda;
  moeda: string | null;
  timeZone: string;
}) {
  const { t } = useIdioma();

  usePainel(fechar, true);

  return (
    <div
      aria-label={t("Agendar atendimento")}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={fechar}
      role="dialog"
    >
      <div
        className="flex max-h-[85dvh] w-full flex-col overflow-y-auto rounded-t-3xl border border-border bg-surface p-3 shadow-xl sm:max-h-[86vh] sm:max-w-lg sm:rounded-2xl sm:p-4"
        onClick={(evento) => evento.stopPropagation()}
      >
        <NovaMarcacaoForm
          action={marcar.action}
          contactos={marcar.contactos}
          dia={dia}
          fechar={fechar}
          moeda={moeda}
          servicos={marcar.servicos}
          timeZone={timeZone}
        />
      </div>
    </div>
  );
}

/**
 * O painel de um dia.
 *
 * Ao telemóvel sobe de baixo e ocupa o ecrã até 85% da altura, que é o gesto
 * que se espera de um painel num telefone. A partir do `sm:` centra-se.
 *
 * O formulário de marcar abre dentro da zona que rola, por cima da lista do
 * dia e não em vez dela: quem está a escolher a hora quer ver o que já lá
 * está sem ter de fechar o que estava a preencher.
 */
function PainelDoDia({
  abrirEvento,
  dia,
  executorEscolhido,
  fechar,
  linkDaSemana,
  marcar,
  moeda,
  temEventoPorCima,
  timeZone,
}: {
  abrirEvento: (id: string) => void;
  dia: DiaAgenda;
  executorEscolhido: string;
  fechar: () => void;
  linkDaSemana: string | null;
  marcar: MarcarNaAgenda | null;
  moeda: string | null;
  temEventoPorCima: boolean;
  timeZone: string;
}) {
  const { locale, t } = useIdioma();
  const [aMarcar, setAMarcar] = useState(false);

  usePainel(fechar, !temEventoPorCima);

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
        travado aqui — sem isto, carregar num evento fechava este painel ao
        mesmo tempo que abria o do evento.
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
              {dataLonga(dia.chave, locale)}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {resumoDoDia(dia, t)}
            </p>
          </div>

          <button
            aria-label={t("Fechar")}
            autoFocus
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={fechar}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4 sm:px-5">
          {marcar && aMarcar ? (
            <NovaMarcacaoForm
              action={marcar.action}
              contactos={marcar.contactos}
              dia={dia.chave}
              fechar={() => setAMarcar(false)}
              moeda={moeda}
              servicos={marcar.servicos}
              timeZone={timeZone}
            />
          ) : null}

          {dia.eventos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
              {t("Dia livre.")}
            </p>
          ) : (
            dia.eventos.map((evento) => (
              <Evento
                abrirEvento={abrirEvento}
                evento={evento}
                key={evento.id}
                moeda={moeda}
                mostrarExecutor={executorEscolhido === ""}
                timeZone={timeZone}
              />
            ))
          )}
        </div>

        {marcar || linkDaSemana ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border px-4 py-3 sm:px-5">
            {marcar && !aMarcar ? (
              <button
                className="ds-botao ds-botao-primario"
                onClick={() => setAMarcar(true)}
                type="button"
              >
                {t("Agendar atendimento")}
              </button>
            ) : null}

            {linkDaSemana ? (
              <Link
                className="text-sm font-semibold text-foreground underline underline-offset-4"
                href={linkDaSemana}
              >
                {t("Ver a semana deste dia")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LinhaDoEvento({
  children,
  rotulo,
}: {
  children: React.ReactNode;
  rotulo: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-2.5 last:border-b-0 sm:flex-row sm:gap-4 sm:py-3">
      <p className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:w-28 sm:pt-0.5">
        {rotulo}
      </p>
      <div className="min-w-0 flex-1 text-sm break-words text-foreground">
        {children}
      </div>
    </div>
  );
}

/**
 * O painel de um evento.
 *
 * Tem a mesma forma do painel do dia — sobe de baixo ao telemóvel, centra-se a
 * partir do `sm:` — mas fica por cima dele, porque no mês chega-se aqui a
 * partir dele e fechar este tem de devolver a pessoa ao dia que estava a ver.
 *
 * O telefone é a razão principal para isto existir: está na tabela desde o
 * início e não aparecia em sítio nenhum do painel, e é o que se procura quando
 * alguém não apareceu.
 */
function PainelDoEvento({
  evento,
  fechar,
  moeda,
  timeZone,
}: {
  evento: EventoAgenda;
  fechar: () => void;
  moeda: string | null;
  timeZone: string;
}) {
  const { locale, t } = useIdioma();

  usePainel(fechar, true);

  const doAgente = evento.origem === "agente";
  const titulo = tituloDoEvento(evento, t);

  /*
   * A data lê-se do instante no fuso do cliente e não da chave do dia: este
   * painel também abre a partir da semana, onde não há chave à mão, e um
   * evento de dia inteiro está guardado à meia-noite local, por isso dá o
   * mesmo dia nos dois caminhos.
   */
  const dataDoEvento = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone,
    weekday: "long",
    year: "numeric",
  }).format(new Date(evento.inicio));

  /*
   * O título como está escrito no Google, quando é diferente do que já está
   * em cima.
   *
   * Parece repetição e não é. No Detail o título traz o carro — "Lavagem
   * Express — João Alexandre Narciso (Toyota C-HR GR)" — e o carro não está
   * em coluna nenhuma. Na Miranda apanha os casos em que o título e o serviço
   * não dizem o mesmo: a 2026-10-18 há uma marcação com `servico` a dizer
   * "Consulta de Avaliação" e título a dizer "Limpieza". Sem esta linha, o
   * painel escolhia um dos dois e escondia o desacordo.
   *
   * Nas marcações escritas à mão o título já é o que está em cima, por isso
   * a linha não aparece.
   */
  const tituloNoGoogle =
    evento.titulo && evento.titulo !== titulo ? evento.titulo : null;

  const temDetalhe = Boolean(
    evento.servico ||
      evento.telefone ||
      evento.localizacao ||
      evento.executor ||
      tituloNoGoogle ||
      (evento.valorPrevisto !== null && moeda),
  );

  return (
    <div
      aria-labelledby="titulo-do-evento"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={fechar}
      role="dialog"
    >
      <div
        className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl border border-border bg-surface shadow-xl sm:max-h-[86vh] sm:max-w-lg sm:rounded-2xl"
        onClick={(clique) => clique.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <span
              className={`ds-selo ${
                doAgente ? "ds-selo-verde" : "ds-selo-neutro"
              }`}
            >
              {doAgente ? t("Agendado pelo agente") : t("Agendado manualmente")}
            </span>

            <h2
              className="mt-1.5 text-base leading-tight font-semibold text-foreground"
              id="titulo-do-evento"
            >
              {titulo}
            </h2>

            {/* `first-letter:uppercase` pela mesma razão do painel do dia. */}
            <p className="mt-0.5 text-xs text-muted-foreground first-letter:uppercase">
              {dataDoEvento} · {horas(evento, timeZone, locale, t)}
            </p>
          </div>

          <button
            aria-label={t("Fechar")}
            autoFocus
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={fechar}
            type="button"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-5">
          {temDetalhe ? (
            <>
              {evento.servico ? (
                <LinhaDoEvento rotulo={t("Serviço")}>
                  {evento.servico}
                </LinhaDoEvento>
              ) : null}

              {evento.valorPrevisto !== null && moeda ? (
                <LinhaDoEvento rotulo={t("Valor previsto")}>
                  {dinheiro(evento.valorPrevisto, moeda, locale)}
                </LinhaDoEvento>
              ) : null}

              {evento.telefone ? (
                <LinhaDoEvento rotulo={t("Telefone")}>
                  {/*
                    Um `tel:` e não texto seco: ao telemóvel é daqui que se
                    liga a quem não apareceu, e é o único sítio do painel onde
                    o número existe.
                  */}
                  <a
                    className="inline-flex items-center gap-1.5 font-medium underline underline-offset-4"
                    href={`tel:${evento.telefone}`}
                  >
                    <Phone aria-hidden="true" className="h-3.5 w-3.5" />
                    {evento.telefone}
                  </a>
                </LinhaDoEvento>
              ) : null}

              {evento.localizacao ? (
                <LinhaDoEvento rotulo={t("Onde")}>
                  <span className="flex items-start gap-1.5">
                    <MapPin
                      aria-hidden="true"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    />
                    <span className="min-w-0">{evento.localizacao}</span>
                  </span>
                </LinhaDoEvento>
              ) : null}

              {evento.executor ? (
                <LinhaDoEvento rotulo={t("Quem faz")}>
                  {nomeExecutor(evento.executor)}
                </LinhaDoEvento>
              ) : null}

              {tituloNoGoogle ? (
                <LinhaDoEvento rotulo={t("No Google")}>
                  {tituloNoGoogle}
                </LinhaDoEvento>
              ) : null}
            </>
          ) : (
            <p className="px-1 py-6 text-sm text-muted-foreground">
              {t(
                "Este evento foi criado manualmente no Google e não tem mais nada salvo além da hora e do título.",
              )}
            </p>
          )}
        </div>

        {/*
          O Google é a fonte da verdade, por isso é lá que se altera. Este link
          é o que antes estava no cartão.
        */}
        {evento.linkGoogle ? (
          <div className="shrink-0 border-t border-border px-4 py-3 sm:px-5">
            <a
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground underline underline-offset-4"
              href={evento.linkGoogle}
              rel="noreferrer noopener"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              {t("Abrir no Google para alterar")}
            </a>
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
  const { locale, t } = useIdioma();

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
          {diaDaSemana(dia.chave, locale).slice(0, 3)}
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
            title={`${diaDaSemana(dia.chave, locale)}, ${diaDoMes(
              dia.chave,
              locale,
            )} — ${resumoDoDia(dia, t)}`}
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
                  {t("+{n} mais", { n: dia.eventos.length - visiveis.length })}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Quantos pixels vale uma hora na semana desenhada por hora. */
const HORA_PX = 52;

/** Minutos desde a meia-noite, no fuso do cliente. */
function minutosNoFuso(iso: string, timeZone: string) {
  const partes = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).formatToParts(new Date(iso));
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? 0);

  return hora * 60 + minuto;
}

const horaCurta = (iso: string, timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));

type Bloco = {
  evento: EventoAgenda;
  faixa: number;
  faixas: number;
  fim: number;
  inicio: number;
};

/**
 * Põe os eventos de um dia na coluna. Dois atendimentos à mesma hora ficam
 * lado a lado (cada um numa faixa), em vez de um tapar o outro.
 */
/** Oito horas ou mais: vai para a faixa do topo em vez de ocupar a coluna. */
const LONGO_MIN = 8 * 60;

const duracaoEmMinutos = (evento: EventoAgenda) =>
  evento.fim
    ? (new Date(evento.fim).getTime() - new Date(evento.inicio).getTime()) / 60_000
    : 60;

/**
 * Fica na faixa do topo: o dia inteiro e os trabalhos longos (no Detail um
 * carro pode ficar o dia todo, ou vários dias). Dentro das colunas eles
 * tapavam a semana inteira e espremiam os outros atendimentos.
 */
const vaiParaOTopo = (evento: EventoAgenda) =>
  evento.diaInteiro || duracaoEmMinutos(evento) >= LONGO_MIN;

function arrumarDia(eventos: EventoAgenda[], timeZone: string): Bloco[] {
  const blocos: Bloco[] = eventos
    .filter((evento) => !vaiParaOTopo(evento))
    .map((evento) => {
      const inicio = minutosNoFuso(evento.inicio, timeZone);
      // Sem hora de fim, conta como uma hora: é o que o Google mostra.
      const duracao = Math.max(15, duracaoEmMinutos(evento));

      return {
        evento,
        faixa: 0,
        faixas: 1,
        fim: Math.min(24 * 60, inicio + duracao),
        inicio,
      };
    })
    .sort((a, b) => a.inicio - b.inicio || b.fim - a.fim);

  let grupo: Bloco[] = [];
  let fimDoGrupo = -1;
  const finsDasFaixas: number[] = [];

  const fecharGrupo = () => {
    const faixas = Math.max(1, ...grupo.map((bloco) => bloco.faixa + 1));
    grupo.forEach((bloco) => {
      bloco.faixas = faixas;
    });
    grupo = [];
    finsDasFaixas.length = 0;
  };

  for (const bloco of blocos) {
    if (grupo.length > 0 && bloco.inicio >= fimDoGrupo) {
      fecharGrupo();
    }

    let faixa = finsDasFaixas.findIndex((fim) => fim <= bloco.inicio);

    if (faixa === -1) {
      faixa = finsDasFaixas.length;
      finsDasFaixas.push(bloco.fim);
    } else {
      finsDasFaixas[faixa] = bloco.fim;
    }

    bloco.faixa = faixa;
    grupo.push(bloco);
    fimDoGrupo = Math.max(fimDoGrupo, bloco.fim);
  }

  if (grupo.length > 0) {
    fecharGrupo();
  }

  return blocos;
}

/**
 * A hora de agora, só no navegador. No servidor fica `null`: assim a linha
 * vermelha e o "próximo" não fazem o React reclamar de hidratação.
 */
function useAgora() {
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    const marcar = () => setAgora(new Date());
    const primeiro = window.setTimeout(marcar, 0);
    const relogio = window.setInterval(marcar, 60_000);

    return () => {
      window.clearTimeout(primeiro);
      window.clearInterval(relogio);
    };
  }, []);

  return agora;
}

const corDoEvento = (doAgente: boolean) =>
  doAgente
    ? "border-l-[var(--ds-acao)] bg-[var(--ds-acao-fundo)]"
    : "border-l-[var(--ds-texto-3)] bg-[color-mix(in_oklab,var(--ds-texto)_5%,var(--ds-superficie))]";

/**
 * A semana desenhada por hora, como no Google: uma coluna por dia e cada
 * atendimento no sítio da sua hora. Verde quando foi o agente, cinza quando
 * foi à mão. Só a partir do `lg:`; no celular a semana vira lista por dia.
 */
function SemanaPorHora({
  abrirDia,
  abrirEvento,
  agenda,
  agora,
  executorEscolhido,
  timeZone,
}: {
  abrirDia: (chave: string) => void;
  abrirEvento: (id: string) => void;
  agenda: AgendaResultado;
  agora: Date | null;
  executorEscolhido: string;
  timeZone: string;
}) {
  const { locale, t } = useIdioma();

  const porDia = agenda.dias.map((dia) => ({
    blocos: arrumarDia(dia.eventos, timeZone),
    dia,
    diaInteiro: dia.eventos.filter(vaiParaOTopo),
  }));

  const todos = porDia.flatMap(({ blocos }) => blocos);
  // A grelha vai das 8h às 19h, e cresce se houver atendimento fora disso.
  const primeiraHora = Math.min(
    8,
    ...todos.map((bloco) => Math.floor(bloco.inicio / 60)),
  );
  const ultimaHora = Math.min(
    24,
    Math.max(19, ...todos.map((bloco) => Math.ceil(bloco.fim / 60))),
  );
  const horasNaGrelha = Array.from(
    { length: ultimaHora - primeiraHora },
    (_, i) => primeiraHora + i,
  );
  const altura = horasNaGrelha.length * HORA_PX;
  const temDiaInteiro = porDia.some(({ diaInteiro }) => diaInteiro.length > 0);

  const minutoAgora = agora ? minutosNoFuso(agora.toISOString(), timeZone) : null;
  const topoAgora =
    minutoAgora !== null &&
    minutoAgora >= primeiraHora * 60 &&
    minutoAgora <= ultimaHora * 60
      ? ((minutoAgora - primeiraHora * 60) / 60) * HORA_PX
      : null;

  const colunas = "grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]";

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[56rem]">
        <div className={`${colunas} border-b border-border`}>
          <div />
          {agenda.dias.map((dia) => (
            <button
              className="flex min-w-0 items-baseline gap-2 border-l border-border px-3 py-3 text-left transition hover:bg-muted/40"
              key={dia.chave}
              onClick={() => abrirDia(dia.chave)}
              title={resumoDoDia(dia, t)}
              type="button"
            >
              <span className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                {diaDaSemana(dia.chave, locale).slice(0, 3)}
              </span>
              <span
                className={`text-lg leading-none font-semibold tracking-tight tabular-nums ${
                  dia.hoje
                    ? "rounded-lg bg-primary px-1.5 py-0.5 text-primary-foreground"
                    : "text-foreground"
                }`}
              >
                {Number(dia.chave.slice(8))}
              </span>
              {dia.eventos.length > 0 ? (
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                  {dia.eventos.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {temDiaInteiro ? (
          <div className={`${colunas} border-b border-border`}>
            <p className="px-1 py-1.5 text-right text-[10px] leading-tight text-muted-foreground">
              {t("Dia inteiro")}
            </p>
            {porDia.map(({ dia, diaInteiro }) => (
              <div
                className="flex min-w-0 flex-col gap-1 border-l border-border p-1"
                key={dia.chave}
              >
                {diaInteiro.map((evento) => (
                  <button
                    className={`truncate rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] font-medium text-foreground ${corDoEvento(
                      evento.origem === "agente",
                    )}`}
                    key={evento.id}
                    onClick={() => abrirEvento(evento.id)}
                    type="button"
                  >
                    {evento.diaInteiro ? null : (
                      <span className="font-semibold tabular-nums">
                        {horaCurta(evento.inicio, timeZone, locale)}{" "}
                      </span>
                    )}
                    {tituloDoEvento(evento, t)}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        <div className={colunas} style={{ height: altura }}>
          <div className="relative">
            {horasNaGrelha.map((hora, i) => (
              <span
                className="absolute right-2 text-[11px] text-muted-foreground tabular-nums"
                key={hora}
                style={{ top: i * HORA_PX + 2 }}
              >
                {hora}h
              </span>
            ))}
          </div>

          {porDia.map(({ blocos, dia }) => (
            <div
              className={`relative border-l border-border ${
                dia.hoje
                  ? "bg-[color-mix(in_oklab,var(--ds-acao)_4%,transparent)]"
                  : ""
              }`}
              key={dia.chave}
              style={{
                backgroundImage:
                  "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                backgroundSize: `100% ${HORA_PX}px`,
              }}
            >
              {blocos.map(({ evento, faixa, faixas, fim, inicio }) => {
                const topo = ((inicio - primeiraHora * 60) / 60) * HORA_PX;
                const alto = Math.max(22, ((fim - inicio) / 60) * HORA_PX - 3);
                const doAgente = evento.origem === "agente";
                const titulo = tituloDoEvento(evento, t);
                const hora = horaCurta(evento.inicio, timeZone, locale);
                const detalhe = [
                  hora,
                  evento.servico,
                  executorEscolhido === "" && evento.executor
                    ? nomeExecutor(evento.executor)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <button
                    className={`absolute flex flex-col justify-start overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left leading-tight transition hover:z-10 hover:shadow-[0_4px_14px_rgb(0_0_0/0.12)] ${corDoEvento(
                      doAgente,
                    )}`}
                    key={evento.id}
                    onClick={() => abrirEvento(evento.id)}
                    style={{
                      height: alto,
                      left: `calc(${(faixa / faixas) * 100}% + 3px)`,
                      top: topo + 1,
                      width: `calc(${100 / faixas}% - 6px)`,
                    }}
                    title={`${titulo} · ${detalhe}`}
                    type="button"
                  >
                    {alto < 34 ? (
                      <span className="block truncate text-[11px] text-foreground">
                        <span className="font-semibold tabular-nums">{hora}</span>{" "}
                        {titulo}
                      </span>
                    ) : (
                      <>
                        <span className="block truncate text-xs font-semibold text-foreground">
                          {titulo}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {detalhe}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}

              {dia.hoje && topoAgora !== null ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 left-0 z-20 border-t-2 border-danger"
                  style={{ top: topoAgora }}
                >
                  <span className="absolute -top-[5px] -left-[5px] h-2 w-2 rounded-full bg-danger" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A semana no celular: um bloco por dia, de cima para baixo, com a hora à
 * esquerda. Os dias livres ficam numa linha só, para não empurrar o resto.
 */
function SemanaEmLista({
  abrirDia,
  abrirEvento,
  agenda,
  executorEscolhido,
  timeZone,
}: {
  abrirDia: (chave: string) => void;
  abrirEvento: (id: string) => void;
  agenda: AgendaResultado;
  executorEscolhido: string;
  timeZone: string;
}) {
  const { locale, t } = useIdioma();

  return (
    <div className="flex flex-col gap-2.5">
      {agenda.dias.map((dia) => {
        const vazio = dia.eventos.length === 0;

        return (
          <section className="ds-bloco overflow-hidden" key={dia.chave}>
            <button
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
              onClick={() => abrirDia(dia.chave)}
              type="button"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-semibold tabular-nums ${
                  dia.hoje
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {Number(dia.chave.slice(8))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground capitalize">
                  {diaDaSemana(dia.chave, locale)}
                  {dia.hoje ? (
                    <span className="ml-2 text-xs font-medium text-accent normal-case">
                      {t("Hoje")}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {vazio
                  ? t("Livre")
                  : dia.eventos.length === 1
                    ? t("1 atendimento")
                    : t("{n} atendimentos", { n: dia.eventos.length })}
              </span>
            </button>

            {vazio ? null : (
              <ul className="border-t border-border">
                {dia.eventos.map((evento) => {
                  const doAgente = evento.origem === "agente";
                  const detalhe = [
                    evento.servico,
                    executorEscolhido === "" && evento.executor
                      ? nomeExecutor(evento.executor)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <li
                      className="border-b border-border/60 last:border-b-0"
                      key={evento.id}
                    >
                      <button
                        className="flex w-full items-stretch gap-3 px-4 py-2.5 text-left transition hover:bg-muted/40"
                        onClick={() => abrirEvento(evento.id)}
                        type="button"
                      >
                        <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold text-foreground tabular-nums">
                          {evento.diaInteiro
                            ? t("Dia inteiro")
                            : horaCurta(evento.inicio, timeZone, locale)}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`w-[3px] shrink-0 rounded-full ${
                            doAgente ? "bg-primary" : "bg-muted-foreground/40"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {tituloDoEvento(evento, t)}
                          </span>
                          {detalhe ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {detalhe}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`ds-selo shrink-0 self-center ${
                            doAgente ? "ds-selo-verde" : "ds-selo-neutro"
                          }`}
                        >
                          {doAgente ? t("Agente") : t("Manual")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function AgendaPanel({
  agenda,
  executorEscolhido,
  marcar,
  moeda,
  timeZone,
}: {
  agenda: AgendaResultado;
  executorEscolhido: string;
  marcar: MarcarNaAgenda | null;
  moeda: string | null;
  timeZone: string;
}) {
  const { locale, t } = useIdioma();
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [eventoAberto, setEventoAberto] = useState<string | null>(null);
  const [aMarcarDoTopo, setAMarcarDoTopo] = useState(false);
  const agora = useAgora();

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

  // O evento guarda-se pelo identificador pela mesma razão, e procura-se em
  // todos os dias porque na semana abre-se sem passar pelo painel do dia.
  const evento = agenda.dias
    .flatMap((candidato) => candidato.eventos)
    .find((candidato) => candidato.id === eventoAberto);

  /*
   * Os números dos cartões saem todos do que a tela já carregou (`agenda`):
   * nenhuma consulta nova. "Hoje" só aparece quando hoje está no período à
   * vista, porque é o único caso em que os dados de hoje estão na mão.
   */
  const diasDoPeriodo = agenda.dias.filter((candidato) => !candidato.foraDoPeriodo);
  const hoje = diasDoPeriodo.find((candidato) => candidato.hoje) ?? null;
  const proximoHoje =
    hoje && agora
      ? (hoje.eventos.find(
          (candidato) =>
            !candidato.diaInteiro && new Date(candidato.inicio) > agora,
        ) ?? null)
      : null;
  const maisCheio = diasDoPeriodo.reduce<DiaAgenda | null>(
    (melhor, candidato) =>
      candidato.eventos.length > (melhor?.eventos.length ?? 0) ? candidato : melhor,
    null,
  );
  const diasLivres = diasDoPeriodo.filter(
    (candidato) => candidato.eventos.length === 0,
  ).length;
  const manuais = agenda.total - agenda.marcadosPeloAgente;

  const exportar = (
    // Exporta o período que está no ecrã — a semana ou o mês, com o filtro de
    // executor já aplicado, porque é isso que `agenda.dias` traz.
    <BotaoExportar
      assunto="agenda"
      colunas={colunasDaAgenda(moeda, timeZone)}
      linhas={agenda.dias.flatMap((candidato) => candidato.eventos)}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoTela
        acoes={
          <>
            {/*
              A troca de vista leva o dia de referência consigo: quem está em
              outubro e carrega em "Semana" quer a semana em que está, não a
              semana do dia 1.
            */}
            <FiltroTrilho
              opcoes={[
                {
                  ativo: agenda.vista === "semana",
                  href: ligacao({ dia: agenda.diaDeReferencia, vista: "semana" }),
                  label: t("Semana"),
                },
                {
                  ativo: agenda.vista === "mes",
                  href: ligacao({ dia: agenda.diaDeReferencia, vista: "mes" }),
                  label: t("Mês"),
                },
              ]}
              rotulo={t("Vista")}
            />
            {exportar}
            {/*
              Marcar fica aqui em cima e não só dentro do painel do dia: quem
              chega à agenda a querer marcar tinha de adivinhar que o caminho
              era abrir um dia primeiro.
            */}
            {marcar ? (
              <button
                className="ds-botao ds-botao-primario"
                onClick={() => setAMarcarDoTopo(true)}
                type="button"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t("Agendar atendimento")}
              </button>
            ) : null}
          </>
        }
        destaque={
          agenda.total === 0
            ? undefined
            : agenda.total === 1
              ? t("1 atendimento")
              : t("{n} atendimentos", { n: agenda.total })
        }
        resto={
          agenda.total === 0
            ? agenda.vista === "mes"
              ? t("Nada agendado neste mês.")
              : t("Nada agendado nesta semana.")
            : agenda.vista === "mes"
              ? t("neste mês, {agente} pelo agente.", {
                  agente: agenda.marcadosPeloAgente,
                })
              : t("nesta semana, {agente} pelo agente.", {
                  agente: agenda.marcadosPeloAgente,
                })
        }
        sobretitulo={t("Agenda")}
      />

      {agenda.total > 0 || hoje ? (
        <GradeMetricas colunas={hoje ? 4 : 3}>
          {hoje ? (
            <CartaoMetrica
              icone={<CalendarClock aria-hidden="true" className="h-4 w-4" />}
              nota={
                proximoHoje
                  ? t("Próximo: {nome} às {hora}", {
                      hora: horaCurta(proximoHoje.inicio, timeZone, locale),
                      nome: tituloDoEvento(proximoHoje, t),
                    })
                  : agora && hoje.eventos.length > 0
                    ? t("Nada mais por hoje.")
                    : hoje.eventos.length === 0
                      ? t("Dia livre.")
                      : undefined
              }
              rotulo={t("Hoje")}
              valor={String(hoje.eventos.length)}
            />
          ) : null}
          <CartaoMetrica
            cor="var(--ds-info)"
            icone={<Bot aria-hidden="true" className="h-4 w-4" />}
            nota={
              manuais === 1
                ? t("1 marcado à mão.")
                : t("{n} marcados à mão.", { n: manuais })
            }
            rotulo={t("Pelo agente")}
            unidade={t("de {total}", { total: agenda.total })}
            valor={String(agenda.marcadosPeloAgente)}
          />
          <CartaoMetrica
            cor="var(--ds-ouro)"
            icone={<TrendingUp aria-hidden="true" className="h-4 w-4" />}
            nota={
              maisCheio
                ? `${diaDoMes(maisCheio.chave, locale)} · ${
                    maisCheio.eventos.length === 1
                      ? t("1 atendimento")
                      : t("{n} atendimentos", { n: maisCheio.eventos.length })
                  }`
                : undefined
            }
            rotulo={t("Dia mais cheio")}
            valor={
              maisCheio
                ? diaDaSemana(maisCheio.chave, locale).replace(/^./, (letra) =>
                    letra.toUpperCase(),
                  )
                : "--"
            }
          />
          <CartaoMetrica
            cor="var(--ds-alerta)"
            icone={<CalendarCheck aria-hidden="true" className="h-4 w-4" />}
            nota={t("Sem nada agendado.")}
            rotulo={t("Dias livres")}
            valor={String(diasLivres)}
          />
        </GradeMetricas>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Botao href={ligacao({ dia: agenda.anterior })} titulo={t("Anterior")}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Botao>
          <Botao href={ligacao({})}>{t("Hoje")}</Botao>
          <Botao href={ligacao({ dia: agenda.proximo })} titulo={t("Próximo")}>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Botao>

          <p className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold text-foreground first-letter:uppercase">
            {rotuloDoPeriodo(agenda, locale)}
          </p>
        </div>

        {/*
          O filtro só aparece quando há mais do que uma pessoa no período. Na
          Miranda é sempre o Samuel, e um filtro com uma opção só é um botão
          que não faz nada.
        */}
        {agenda.executores.length > 1 ? (
          <FiltroTrilho
            opcoes={[
              {
                ativo: executorEscolhido === "",
                href: ligacao({ dia: agenda.inicio, executor: "" }),
                label: t("Todos"),
              },
              ...agenda.executores.map((executor) => ({
                ativo: executorEscolhido === executor,
                href: ligacao({ dia: agenda.inicio, executor }),
                label: nomeExecutor(executor),
              })),
            ]}
            rotulo={t("Quem faz")}
          />
        ) : null}
      </div>

      {agenda.total === 0 && agenda.vista === "semana" ? (
        <div className="ds-bloco">
          <VazioTela
            acao={
              marcar ? (
                <button
                  className="ds-botao ds-botao-primario"
                  onClick={() => setAMarcarDoTopo(true)}
                  type="button"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  {t("Agendar atendimento")}
                </button>
              ) : undefined
            }
            texto={t(
              "Os atendimentos aparecem aqui assim que entram no Google Agenda, pelo agente ou à mão.",
            )}
            titulo={t("Semana livre")}
          />
        </div>
      ) : agenda.vista === "mes" ? (
        <GrelhaMes abrirDia={setDiaAberto} agenda={agenda} timeZone={timeZone} />
      ) : (
        <>
          <div className="ds-bloco hidden overflow-hidden lg:block">
            <SemanaPorHora
              abrirDia={setDiaAberto}
              abrirEvento={setEventoAberto}
              agenda={agenda}
              agora={agora}
              executorEscolhido={executorEscolhido}
              timeZone={timeZone}
            />
          </div>
          <div className="lg:hidden">
            <SemanaEmLista
              abrirDia={setDiaAberto}
              abrirEvento={setEventoAberto}
              agenda={agenda}
              executorEscolhido={executorEscolhido}
              timeZone={timeZone}
            />
          </div>
        </>
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="ds-selo ds-selo-verde">{t("Agente")}</span>
          {t("Agendado pelo agente")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="ds-selo ds-selo-neutro">{t("Manual")}</span>
          {t("Agendado manualmente")}
        </span>
        {agenda.vista === "semana" && hoje ? (
          <span className="hidden lg:inline">
            {t("A linha vermelha é a hora atual.")}
          </span>
        ) : null}
        <span>{t("Clique em um dia, ou em um atendimento, para ver os detalhes.")}</span>
      </p>

      {marcar && aMarcarDoTopo ? (
        <PainelDeMarcar
          dia={agenda.diaDeReferencia}
          fechar={() => setAMarcarDoTopo(false)}
          marcar={marcar}
          moeda={moeda}
          timeZone={timeZone}
        />
      ) : null}

      {dia ? (
        <PainelDoDia
          abrirEvento={setEventoAberto}
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
          marcar={marcar}
          moeda={moeda}
          temEventoPorCima={Boolean(evento)}
          timeZone={timeZone}
        />
      ) : null}

      {evento ? (
        <PainelDoEvento
          evento={evento}
          fechar={() => setEventoAberto(null)}
          moeda={moeda}
          timeZone={timeZone}
        />
      ) : null}
    </div>
  );
}
