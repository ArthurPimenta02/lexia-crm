"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BotaoExportar } from "@/app/components/botao-exportar";
import { useIdioma } from "@/app/components/idioma";
import { Dica } from "@/app/components/painel-ui";
import { AvatarCanal, CabecalhoTela, VazioTela } from "@/app/components/tela";
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

/** A cor do selo da etiqueta da IA: o que pede ação fica laranja. */
function corDoResultado(rotulo: string) {
  switch (rotulo) {
    case "Falou em marcar":
    case "Interessado":
      return "ds-selo-alerta";
    case "Pós-venda":
      return "ds-selo-verde";
    case "Passou para a equipa":
      return "ds-selo-ouro";
    default:
      return "ds-selo-neutro";
  }
}

/** Há quanto tempo foi a última mensagem, em dias de calendário. */
function haQuanto(cartao: CartaoPipeline, t: FuncaoT) {
  if (!cartao.ultimaMensagemEm) {
    return null;
  }

  return cartao.dias === 0
    ? t("hoje")
    : cartao.dias === 1
      ? t("ontem")
      : t("há {n} dias", { n: cartao.dias });
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
    // `||` e não `??`: há contatos do Instagram com nome vazio (""), e o
    // cartão aparecia sem título nenhum.
    cartao.marcacaoNome || cartao.nome || cartao.telefone || t("Sem nome");
  const alcunha = cartao.marcacaoNome && cartao.nome ? cartao.nome : null;
  const segundaLinha =
    [alcunha, titulo === cartao.telefone ? null : cartao.telefone]
      .filter(Boolean)
      .join(" · ") || null;

  const quando = haQuanto(cartao, t);

  return (
    <Link
      className="flex min-w-0 shrink-0 flex-col gap-2 rounded-[14px] border border-border bg-surface p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_18px_-6px_rgb(0_0_0/0.14)]"
      href={`/app/conversas?conversa=${encodeURIComponent(cartao.identificadorConversa)}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <AvatarCanal canal={cartao.canal} nome={titulo} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {titulo}
          </p>
          {segundaLinha ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {segundaLinha}
            </p>
          ) : null}
        </div>
        {quando ? (
          <span className="shrink-0 self-start text-[11px] text-muted-foreground">
            {quando}
          </span>
        ) : null}
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
                ? "ds-selo-verde"
                : "ds-selo-neutro"
            }`}
          >
            {cartao.marcacaoOrigem === "agente" ? t("Agente") : t("Manual")}
          </span>
        </div>
      ) : null}

      <p className="text-[0.8125rem] leading-snug text-muted-foreground">
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
          <span className={`ds-selo ${corDoResultado(cartao.resultado)}`}>
            {rotuloDoResultado(cartao.resultado, t)}
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground/70 tabular-nums">
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
    <section className="flex max-h-[72dvh] w-[17.5rem] shrink-0 snap-start flex-col rounded-[18px] bg-[color-mix(in_oklab,var(--ds-texto)_3.5%,transparent)]">
      <header className="flex shrink-0 items-center gap-2 px-3.5 pt-3.5 pb-2.5">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${corDaEtapa[etapa]}`}
        />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {rotuloDaEtapa(etapa, t)}
        </h2>
        <span className="shrink-0 text-[0.8125rem] font-medium text-muted-foreground tabular-nums">
          {cartoes.length}
        </span>
        <Dica texto={descricaoDaEtapa(etapa, t)} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cartoes.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
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
  // O título conta o quadro todo, não a busca: é o resumo do dia.
  const semResposta = cartoes.filter((cartao) => cartao.porResponder).length;
  const emAndamento = cartoes.filter(
    (cartao) => cartao.etapa === "a_decorrer",
  ).length;

  // Exactamente o que está no quadro, pela ordem do quadro: com a procura
  // aplicada, e com os perdidos só se estiverem abertos. Achatar as colunas
  // em vez de refiltrar os cartões faz o ficheiro sair agrupado por coluna,
  // que é como a pessoa está a olhar para eles.
  const paraExportar = colunas.flatMap(({ cartoes: daColuna }) => daColuna);

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoTela
        acoes={
          <BotaoExportar
            assunto="pipeline"
            colunas={colunasDoPipeline(timeZone)}
            linhas={paraExportar}
          />
        }
        destaque={
          semResposta === 0
            ? undefined
            : semResposta === 1
              ? t("1 pessoa")
              : t("{n} pessoas", { n: semResposta })
        }
        resto={
          semResposta === 0
            ? t("Ninguém sem resposta, {n} em andamento.", { n: emAndamento })
            : t("sem resposta e {n} em andamento.", { n: emAndamento })
        }
        sobretitulo={t("Pipeline · atualiza sozinho")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            aria-label={t("Buscar por nome ou telefone")}
            className="ds-campo w-full pl-9"
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder={t("Buscar por nome ou telefone")}
            type="search"
            value={busca}
          />
        </label>

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
      </div>

      {cartoes.length === 0 ? (
        <div className="ds-bloco">
          <VazioTela
            texto={t(
              "Cada pessoa que escrever ao agente aparece aqui e muda de coluna sozinha.",
            )}
            titulo={t("Ainda não há ninguém no pipeline")}
          />
        </div>
      ) : null}

      {/*
        As margens negativas deixam o quadro rolar de borda a borda do ecrã.
        Dentro do contentor do layout, que tem padding, a última coluna ficava
        a meio e parecia que o quadro acabava ali.
      */}
      <div className="-mx-4 flex snap-x items-start gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:-mx-10 lg:scroll-px-10 lg:px-10">
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
