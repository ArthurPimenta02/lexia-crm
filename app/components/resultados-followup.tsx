import type { ReactNode } from "react";

import {
  CalendarCheck,
  Images,
  MessageCircleReply,
  Mic,
  PieChart,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

import { CartaoMetrica } from "@/app/components/cartoes";
import { ChannelIcon } from "@/app/components/channel-brand";
import { Dica } from "@/app/components/dica";
import { GraficoBarras } from "@/app/components/graficos";
import { AvatarCanal, CabecalhoTela, GradeMetricas, VazioTela } from "@/app/components/tela";
import type { EtapaFollowup, HistoriaRecuperada, PeriodoResultados, ResultadosFollowup } from "@/lib/followups/resultados";
import type { FuncaoT } from "@/lib/i18n/traduzir";

/**
 * A tela de resultados do follow-up (cliente em /app/followups, admin em
 * /admin/followups/resultados?cliente=…). Componente de servidor: recebe os
 * números já calculados e o `t` de quem vê.
 *
 * O desenho serve uma pergunta do dono do negócio: "isto vale o que pago?".
 * Por isso abre com as marcações e o dinheiro, mostra casos reais e nunca mostra
 * quantos follow-ups saíram (o Arthur pediu a 21/11: o número assusta e não diz
 * nada sobre o resultado).
 */

const NOMES_CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger" };

export function ResultadosFollowupTela({
  locale,
  periodo,
  r,
  t,
  timezone,
}: {
  locale: string;
  periodo: PeriodoResultados;
  r: ResultadosFollowup;
  t: FuncaoT;
  timezone: string;
}) {
  const dinheiro = new Intl.NumberFormat(locale, { currency: r.moeda, maximumFractionDigits: 0, style: "currency" });
  const numero = new Intl.NumberFormat(locale);
  const data = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: timezone });
  const dataLonga = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: timezone });

  const emBreve = <EmBreve t={t} />;

  if (!r.desde) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-28">
        <CabecalhoTela resto={t("Follow-up")} sobretitulo={t("Recuperação de clientes")} />
        <div className="ds-bloco">
          <VazioTela
            pose="ola"
            texto={t(
              "Assim que o agente entrar em produção, aqui aparecem os clientes que pararam de responder e voltaram, e os agendamentos que o follow-up recuperou.",
            )}
            titulo={t("O seu follow-up começa a contar em breve")}
          />
        </div>
        {emBreve}
      </div>
    );
  }

  const pct = r.marcacoesAgente > 0 ? Math.round((r.recuperadas / r.marcacoesAgente) * 100) : 0;
  const umEmCada = r.recuperadas > 0 ? Math.max(1, Math.round(r.marcacoesAgente / r.recuperadas)) : null;
  const retorno = r.mensalidade && r.valorRecuperado > 0 ? r.valorRecuperado / (r.mensalidade * r.meses) : null;
  const notaEstimado = t(
    "Valor estimado: a maioria dos agendamentos é uma consulta de avaliação. Usamos o preço do tratamento de que o cliente falou na conversa (por exemplo depilação a laser ou limpeza de pele) e, quando não falou de nenhum, o preço da consulta.",
  );

  const etapas: { chave: EtapaFollowup; rotulo: string }[] = [
    { chave: "1h", rotulo: t("1 hora") },
    { chave: "24h", rotulo: t("24 horas") },
    { chave: "3d", rotulo: t("3 dias") },
    { chave: "7d", rotulo: t("7 dias") },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-28">
      <CabecalhoTela
        destaque={t("{n} agendamentos", { n: numero.format(r.recuperadas) })}
        resto={t("recuperados pelo follow-up")}
        sobretitulo={t("Follow-up")}
        subtitulo={periodo === "30d" || periodo === "60d" ? t("Últimos 30 dias") : t("Desde {data}", { data: dataLonga.format(new Date(r.desde)) })}
      />

      {/* O destaque: o dinheiro e a fração dos agendamentos que o follow-up trouxe. */}
      <section className="ds-cartao ds-entrar grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="min-w-0">
          <p className="ds-sobretitulo flex items-center gap-1.5">
            {r.valorEstimado ? t("Em serviços recuperados (estimado)") : t("Em serviços recuperados")}
            {r.valorEstimado ? <Dica texto={notaEstimado} /> : null}
          </p>
          <p className="ds-valor mt-2 text-[2.75rem] leading-none text-accent sm:text-[3.5rem]">
            {dinheiro.format(r.valorRecuperado)}
          </p>
          <p className="mt-3 max-w-[46ch] text-sm text-muted-foreground">
            {t("Clientes que tinham parado de responder, receberam um follow-up e depois agendaram com o agente.")}
          </p>
        </div>
        <div className="min-w-0 border-t border-[var(--ds-linha)] pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          {umEmCada ? (
            <p className="ds-titulo-2 text-foreground">
              {t("1 em cada {n} agendamentos do seu agente veio do follow-up", { n: umEmCada })}
            </p>
          ) : null}
          <div className="mt-4 flex items-center gap-3">
            <Barra pct={pct} />
            <span className="ds-numero shrink-0 text-lg font-semibold text-foreground">{pct}%</span>
          </div>
          <p className="ds-legenda mt-2">
            {t("{a} de {b} agendamentos feitos pelo agente", { a: numero.format(r.recuperadas), b: numero.format(r.marcacoesAgente) })}
          </p>
        </div>
      </section>

      <GradeMetricas colunas={retorno ? 4 : 3}>
        <CartaoMetrica
          cor="var(--ds-acao)"
          icone={<CalendarCheck className="h-4 w-4" />}
          nota={t("feitos pelo agente depois de um follow-up")}
          rotulo={t("Agendamentos recuperados")}
          valor={numero.format(r.recuperadas)}
        />
        <CartaoMetrica
          cor="var(--info)"
          dica={t("Clientes que estavam calados e voltaram a responder depois de um follow-up. São conversas que, sem ele, tinham morrido.")}
          icone={<MessageCircleReply className="h-4 w-4" />}
          nota={t("tinham parado de responder")}
          rotulo={t("Voltaram a conversar")}
          valor={numero.format(r.clientesReanimados)}
        />
        <CartaoMetrica
          cor="var(--ds-destaque)"
          icone={<PieChart className="h-4 w-4" />}
          nota={t("dos agendamentos do agente")}
          rotulo={t("Vieram do follow-up")}
          unidade="%"
          valor={String(pct)}
        />
        {retorno ? (
          <CartaoMetrica
            cor="var(--ds-ouro)"
            dica={t("Valor recuperado dividido pelo que o follow-up custou no período ({valor} por mês).", { valor: dinheiro.format(r.mensalidade ?? 0) })}
            icone={<TrendingUp className="h-4 w-4" />}
            nota={t("o valor da mensalidade")}
            rotulo={t("Retorno")}
            unidade="×"
            valor={new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(retorno)}
          />
        ) : null}
      </GradeMetricas>

      <div className="grid gap-4">
        <div className="ds-bloco ds-entrar min-w-0 p-5">
          <h2 className="ds-titulo-3 text-foreground">{t("Qual follow-up trouxe o cliente de volta")}</h2>
          <p className="ds-legenda mt-0.5 mb-4">{t("Tempo que o cliente estava calado quando recebeu o follow-up")}</p>
          <GraficoBarras
            itens={etapas
              // Uma etapa ainda sem resultado (ex.: a de 7 dias, que começou há pouco) não aparece como barra vazia.
              .filter((e, i) => i < 2 || r.porEtapa[e.chave] > 0)
              .map((e) => ({ rotulo: e.rotulo, valor: r.porEtapa[e.chave] }))}
            vazio={t("Ainda sem agendamentos recuperados neste período.")}
          />
        </div>
      </div>

      {Object.keys(r.porCanal).length > 1 ? (
        <div className="ds-bloco ds-entrar min-w-0 p-5">
          <h2 className="ds-titulo-3 text-foreground">{t("Por canal")}</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {Object.entries(r.porCanal)
              .sort(([, a], [, b]) => b - a)
              .map(([canal, n]) => (
                <span className="ds-selo ds-selo-neutro gap-1.5" key={canal}>
                  <ChannelIcon channel={canal} size="sm" />
                  {NOMES_CANAL[canal] ?? canal}
                  <strong className="tabular-nums">{numero.format(n)}</strong>
                </span>
              ))}
          </div>
        </div>
      ) : null}

      {r.historias.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="ds-titulo-2 text-foreground">{t("Clientes que o follow-up trouxe de volta")}</h2>
            <p className="ds-legenda mt-1">{t("Conversas reais, do follow-up até o agendamento")}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {escolherHistorias(r.historias).map((h) => (
              <Historia dinheiro={dinheiro} data={data} estimado={r.valorEstimado} h={h} key={`${h.marcadoEm}-${h.cliente}`} t={t} />
            ))}
          </div>
        </section>
      ) : null}

      {emBreve}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(
          "Como contamos: um agendamento conta como recuperado quando foi feito pelo agente com um cliente que, nessa conversa, já tinha recebido um follow-up. Agendamentos cancelados e os feitos à mão pela equipe não entram. A porcentagem compara com todos os agendamentos do agente no mesmo período.",
        )}
      </p>
    </div>
  );
}

/** As histórias que melhor contam o que o follow-up faz: primeiro as que têm resposta do cliente, mais recentes primeiro. */
function escolherHistorias(hs: HistoriaRecuperada[]) {
  // Mais forte primeiro: o cliente escreveu uma resposta de verdade (não só "ok") a um follow-up escrito.
  const forca = (h: HistoriaRecuperada) =>
    (h.resposta && h.resposta.texto.length >= 15 ? 2 : h.resposta ? 1 : 0) + (h.followup.texto.startsWith("[") ? 0 : 1);
  return [...hs].sort((a, b) => forca(b) - forca(a) || b.marcadoEm.localeCompare(a.marcadoEm)).slice(0, 6);
}

function Barra({ pct }: { pct: number }) {
  return (
    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--ds-superficie-2)]">
      <div className="h-full rounded-full bg-[var(--ds-acao)]" style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
    </div>
  );
}

function silencio(t: FuncaoT, horas: number) {
  if (horas < 24) return t("Ficou {n} h sem responder", { n: Math.max(1, horas) });
  const dias = Math.round(horas / 24);
  return dias === 1 ? t("Ficou 1 dia sem responder") : t("Ficou {n} dias sem responder", { n: dias });
}

function Historia({
  data,
  dinheiro,
  estimado,
  h,
  t,
}: {
  data: Intl.DateTimeFormat;
  dinheiro: Intl.NumberFormat;
  estimado: boolean;
  h: HistoriaRecuperada;
  t: FuncaoT;
}) {
  const anexo: Record<string, string> = { "[anexo]": t("Anexo"), "[imagem]": t("Imagem"), "[áudio]": t("Mensagem de áudio") };
  const texto = (s: string) =>
    anexo[s] ? (
      <span className="inline-flex items-center gap-1.5 not-italic">
        {s === "[áudio]" ? <Mic aria-hidden="true" className="h-3.5 w-3.5" /> : null}
        {anexo[s]}
      </span>
    ) : (
      <span className="italic">“{s}”</span>
    );
  const passos: { titulo: ReactNode; corpo?: ReactNode; quando?: string; final?: boolean }[] = [
    { titulo: silencio(t, h.silencioHoras) },
    {
      corpo: texto(h.followup.texto),
      quando: data.format(new Date(h.followup.em)),
      titulo: t("O agente mandou o follow-up"),
    },
    ...(h.resposta
      ? [{ corpo: texto(h.resposta.texto), quando: data.format(new Date(h.resposta.em)), titulo: t("O cliente respondeu") }]
      : []),
    {
      final: true,
      quando: data.format(new Date(h.marcadoEm)),
      titulo: (
        <>
          {t("Agendou")} {h.servico ? <strong>{h.servico}</strong> : null}
          {h.valor ? (
            <span className="text-accent">
              {" · "}
              {estimado ? "~" : ""}
              {dinheiro.format(h.valor)}
            </span>
          ) : null}
        </>
      ),
    },
  ];
  return (
    <article className="ds-bloco min-w-0 p-5">
      <header className="mb-4 flex items-center gap-3">
        <AvatarCanal canal={h.canal} nome={h.cliente} tamanho={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{h.cliente}</p>
          <p className="ds-legenda">{t("Recuperado pelo follow-up de {etapa}", { etapa: rotuloEtapa(t, h.etapa) })}</p>
        </div>
      </header>
      <ol className="flex flex-col">
        {passos.map((p, i) => (
          <li className="relative flex gap-3 pb-4 last:pb-0" key={i}>
            {i < passos.length - 1 ? (
              <span aria-hidden="true" className="absolute top-3 bottom-0 left-[5px] w-px bg-[var(--ds-linha-forte)]" />
            ) : null}
            <span
              aria-hidden="true"
              className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ${p.final ? "bg-[var(--ds-acao)]" : "border-2 border-[var(--ds-linha-forte)] bg-[var(--ds-superficie)]"}`}
            />
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${p.final ? "font-medium text-foreground" : "text-foreground"}`}>
                {p.titulo}
                {p.quando ? <span className="ml-2 text-xs text-muted-foreground">{p.quando}</span> : null}
              </p>
              {p.corpo ? <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{p.corpo}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function rotuloEtapa(t: FuncaoT, e: EtapaFollowup) {
  return e === "1h" ? t("1 hora") : e === "24h" ? t("24 horas") : e === "3d" ? t("3 dias") : t("7 dias");
}

function EmBreve({ t }: { t: FuncaoT }) {
  const itens = [
    {
      icone: <Mic className="h-4 w-4" />,
      texto: t("Grave áudios aqui mesmo e diga em que situação cada um é enviado. O agente usa a sua voz para recuperar clientes."),
      titulo: t("Áudios de recuperação com a sua voz"),
    },
    {
      icone: <Images className="h-4 w-4" />,
      texto: t("Fotos de antes e depois e depoimentos enviados no meio da conversa, no momento em que o cliente hesita."),
      titulo: t("Provas sociais na conversa"),
    },
    {
      icone: <SlidersHorizontal className="h-4 w-4" />,
      texto: t("Escolha quando e quantas vezes o follow-up fala com cada cliente e o tom de cada mensagem."),
      titulo: t("Personalizar a automação"),
    },
  ];
  return (
    <section className="flex flex-col gap-3">
      <h2 className="ds-titulo-2 text-foreground">{t("Em breve no seu follow-up")}</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {itens.map((i) => (
          <div className="ds-bloco min-w-0 p-5" key={i.titulo}>
            <div className="flex items-center justify-between gap-2">
              <span className="ds-chip-icone" style={{ ["--chip" as string]: "var(--ds-acao)" }}>
                {i.icone}
              </span>
              <span className="ds-selo ds-selo-neutro">{t("Em breve")}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">{i.titulo}</p>
            <p className="mt-1 text-sm text-muted-foreground">{i.texto}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

