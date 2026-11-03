"use client";

import Link from "next/link";
import {
  Fragment,
  useActionState,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { BotaoExportar } from "@/app/components/botao-exportar";
import { ChannelBadge } from "@/app/components/channel-brand";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { buildAppConversationHref } from "@/app/components/feedback-conversation-utils";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import { useIdioma } from "@/app/components/idioma";
import { SeccaoTitulo } from "@/app/components/painel-ui";
import {
  canaisDeAquisicao,
  canalQuePedeNota,
  getCanalLabel,
  getOrigemCapturadaLabel,
} from "@/lib/clientes/ficha";
import type { ClienteLinha, ClientesDeFora } from "@/lib/clientes/read";
import { colunasDeClientes } from "@/lib/exportar/colunas";
import {
  indicativoPorOmissao,
  indicativosTelefone,
  montarTelefone,
} from "@/lib/clientes/telefone";
import type { GravarClienteResultado } from "@/lib/clientes/write";
import type { FuncaoT } from "@/lib/i18n/traduzir";

/**
 * A ficha de clientes.
 *
 * Decisões de ecrã que valem a pena explicar:
 *
 * - A lista é uma tabela paginada e não uma pilha de cartões. Com 341 clientes
 *   uma pilha obriga a rolar o rato durante meio minuto para chegar ao fim.
 *   Linhas densas e 25 de cada vez é o que os CRMs fazem, e pela mesma razão.
 * - A lista está ordenada pela última mensagem, não por nome. O dono não vem
 *   aqui procurar uma letra; vem ver quem falou com ele.
 * - "Enviar mensagem" abre o `wa.me` em vez de enviar. A plataforma não tem
 *   envio de WhatsApp e, nos canais da Meta, uma mensagem fora da janela de
 *   24 h seria recusada — abrir a conversa é o que funciona sempre.
 * - Juntar não se escolhe numa lista de 341 opções. Os candidatos a sério são
 *   os que têm o mesmo número, e esses aparecem sugeridos; o resto procura-se
 *   a escrever.
 * - Quem não tem telefone utilizável não desaparece em silêncio: o número
 *   aparece em baixo, com a explicação. Um ecrã que mostra 341 de 999 sem
 *   dizer nada parece estar com um defeito.
 */

export type ClienteAction = (
  estado: GravarClienteResultado | null,
  formData: FormData,
) => Promise<GravarClienteResultado>;

export type ServicoOpcao = { id: string; nome: string };
export type ExecutorOpcao = { chave: string; nome: string };

type Filtro = "duplicados" | "parados" | "semNotas" | "todos";

/** Sem falar há mais do que isto, para o filtro dos parados. */
const diasParaParado = 90;
const porPagina = 25;

// `ds-campo` traz a largura a 100%; quem precisa de menos usa `max-w-…`,
// porque o `w-…` do Tailwind perde para a classe do design system.
const inputClass =
  "ds-campo outline-none disabled:bg-surface-muted disabled:text-muted-foreground";

const labelTexto = "text-xs font-semibold text-muted-foreground";

const labelClass = `flex flex-col gap-1.5 ${labelTexto}`;

const botaoPrimario = "ds-botao ds-botao-primario";

const botaoDiscreto = "ds-botao ds-botao-secundario ds-botao-p";

const cartao =
  "rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

/** A moeda é a do cliente; só o formato segue o idioma de quem está a ver. */
function formatMoeda(valor: number, moeda: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    currency: moeda,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(valor);
}

/**
 * O dia, no fuso do cliente e no formato do idioma.
 *
 * O `formatDayInTimezone` de `lib/clientes/timezone` tem o pt-PT fixo e é
 * usado por outras telas; aqui só muda o locale, o fuso fica igual.
 */
function formatarDia(data: string | null, timeZone: string, locale: string) {
  if (!data) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(new Date(data));
}

/**
 * Troca `{nome}` num texto já traduzido por um pedaço de ecrã (um negrito,
 * por exemplo). Deixa a frase inteira no dicionário, em vez de a partir em
 * pedaços que noutra língua ficavam na ordem errada.
 */
function comNos(texto: string, nos: Record<string, ReactNode>) {
  return texto.split(/(\{\w+\})/g).map((parte, indice) => {
    const nome = /^\{(\w+)\}$/.exec(parte)?.[1];

    return (
      <Fragment key={indice}>
        {nome !== undefined && nome in nos ? nos[nome] : parte}
      </Fragment>
    );
  });
}

/**
 * As mensagens que o servidor devolve, no idioma de quem está a ver.
 *
 * Nascem em `lib/clientes/write.ts`, `marcacao.ts` e `telefone.ts`, escritas
 * em pt-PT, e os testes dessas funções comparam-nas assim. Em vez de mexer
 * nelas, traduzem-se aqui, onde são desenhadas. Uma mensagem que não esteja
 * nesta lista aparece como veio — nunca em branco.
 */
function traduzirMensagem(mensagem: string, t: FuncaoT): string {
  switch (mensagem) {
    case "Escreve o nome do cliente.":
      return t("Escreva o nome do cliente.");
    case "O nome é demasiado comprido.":
      return t("O nome é longo demais.");
    case "Nome inválido.":
      return t("Nome inválido.");
    case "Telefone inválido.":
      return t("Telefone inválido.");
    case "Campos inválidos.":
      return t("Campos inválidos.");
    case "Escreve o telefone do cliente.":
      return t("Digite o telefone do cliente.");
    case "Escolhe o país do número.":
      return t("Escolha o país do número.");
    case "O email é demasiado comprido.":
      return t("O email é longo demais.");
    case "A morada é demasiado comprido.":
      return t("O endereço é longo demais.");
    case "O carro é demasiado comprido.":
      return t("O carro é longo demais.");
    case "As notas é demasiado comprido.":
      return t("As notas são longas demais.");
    case "A explicação do canal é demasiado comprido.":
      return t("A explicação do canal é longa demais.");
    case "A idade tem de ser um número entre 1 e 120.":
      return t("A idade tem que ser um número entre 1 e 120.");
    case "Esse canal de aquisição não existe.":
      return t("Esse canal de aquisição não existe.");
    case "Escolheste 'Outro': escreve de onde veio.":
      return t("Você escolheu 'Outro': escreva de onde veio.");
    case "Este número já está no painel. Abre a ficha dele em vez de criar outra.":
      return t("Este número já está no painel. Abra a ficha dele em vez de criar outra.");
    case "Já existe um contacto com este número.":
      return t("Já existe um contato com este número.");
    case "Este número já está no painel. Abre a ficha dele.":
      return t("Este número já está no painel. Abra a ficha dele.");
    case "Não foi possível criar o cliente.":
      return t("Não foi possível criar o cliente.");
    case "Não foi possível ler a ficha do cliente.":
      return t("Não foi possível ler a ficha do cliente.");
    case "Cliente não encontrado.":
      return t("Cliente não encontrado.");
    case "Esta ficha não tem um número de telefone a sério, e é o número que liga o serviço ao histórico. Põe o número primeiro.":
      return t(
        "Esta ficha não tem um número de telefone de verdade, e é o número que liga o serviço ao histórico. Coloque o número primeiro.",
      );
    case "Escolhe o serviço que foi feito e a data.":
      return t("Escolha o serviço que foi feito e a data.");
    case "Não foi possível gravar a ficha.":
      return t("Não foi possível salvar a ficha.");
    case "Ficha gravada.":
      return t("Ficha salva.");
    case "Escolhe dois contactos diferentes.":
      return t("Escolha dois contatos diferentes.");
    case "Não foi possível juntar os contactos.":
      return t("Não foi possível juntar os contatos.");
    case "Contacto não encontrado.":
      return t("Contato não encontrado.");
    case "Esse contacto já está junto a outro. Junta ao contacto principal.":
      return t("Esse contato já está junto a outro. Junte ao contato principal.");
    case "Esse contacto já tem outros juntos a ele. Separa-os primeiro, ou junta na outra direcção.":
      return t(
        "Esse contato já tem outros juntos a ele. Separe-os primeiro, ou junte na outra direção.",
      );
    case "Não foi possível separar os contactos.":
      return t("Não foi possível separar os contatos.");
    case "Contactos separados.":
      return t("Contatos separados.");
    case "Escolhe o serviço que foi feito.":
      return t("Escolha o serviço que foi feito.");
    case "Escolhe a data do serviço.":
      return t("Escolha a data do serviço.");
    case "Este cliente não tem agenda de serviços ligada.":
      return t("Este cliente não tem agenda de serviços conectada.");
    case "A data do serviço não é válida.":
      return t("A data do serviço não é válida.");
    case "A data do serviço não pode ser no futuro. Aqui regista-se o que já foi feito — para marcar, usa a agenda.":
      return t(
        "A data do serviço não pode ser no futuro. Aqui se registra o que já foi feito — para agendar, use a agenda.",
      );
    case "O ticket tem de ser um número igual ou maior que zero.":
      return t("O ticket tem que ser um número igual ou maior que zero.");
    case "Esse executor não existe.":
      return t("Esse profissional não existe.");
    case "Credenciais da base de dados do cliente não configuradas.":
      return t("Credenciais do banco de dados do cliente não configuradas.");
    case "Não foi possível confirmar o serviço.":
      return t("Não foi possível confirmar o serviço.");
    case "Serviço desconhecido.":
      return t("Serviço desconhecido.");
    case "Não foi possível ler o que este cliente já comprou, por isso não se registou nada. Tenta outra vez.":
      return t(
        "Não foi possível ler o que este cliente já comprou, então nada foi registrado. Tente de novo.",
      );
    case "a agenda do cliente recusou a escrita":
      return t("a agenda do cliente recusou a gravação");
  }

  let m: RegExpExecArray | null;

  if ((m = /^Já existem (\d+) contactos com este número\.$/.exec(mensagem))) {
    return t("Já existem {n} contatos com este número.", { n: m[1] });
  }

  if (
    (m =
      /^Este número já está no painel como "(.*)"\. Abre a ficha dele em vez de criar outra\.$/.exec(
        mensagem,
      ))
  ) {
    return t(
      'Este número já está no painel como "{nome}". Abra a ficha dele em vez de criar outra.',
      { nome: m[1] },
    );
  }

  if (
    (m =
      /^(.*) ficou no painel, mas o serviço não foi registado: (.*)\. O contacto está criado — não o cries outra vez\.$/.exec(
        mensagem,
      ))
  ) {
    return t(
      "{nome} ficou no painel, mas o serviço não foi registrado: {erro}. O contato está criado — não o crie de novo.",
      { erro: traduzirMensagem(m[2], t), nome: m[1] },
    );
  }

  if ((m = /^(.*) ficou no painel, com "(.*)" no histórico\.$/.exec(mensagem))) {
    return t('{nome} ficou no painel, com "{servico}" no histórico.', {
      nome: m[1],
      servico: m[2],
    });
  }

  if ((m = /^(.*) ficou no painel\.$/.exec(mensagem))) {
    return t("{nome} ficou no painel.", { nome: m[1] });
  }

  if ((m = /^(.*) já tem um serviço registado\.$/.exec(mensagem))) {
    return t("{nome} já tem um serviço registrado.", {
      nome: m[1] === "Este cliente" ? t("Este cliente") : m[1],
    });
  }

  if ((m = /^(.*) já tem (\d+) serviços registados\.$/.exec(mensagem))) {
    return t("{nome} já tem {n} serviços registrados.", {
      n: m[2],
      nome: m[1] === "Este cliente" ? t("Este cliente") : m[1],
    });
  }

  if ((m = /^O serviço não foi registado: (.*)\.$/.exec(mensagem))) {
    return t("O serviço não foi registrado: {erro}.", {
      erro: traduzirMensagem(m[1], t),
    });
  }

  if ((m = /^"(.*)" entrou no histórico\.$/.exec(mensagem))) {
    return t('"{servico}" entrou no histórico.', { servico: m[1] });
  }

  if ((m = /^Contactos juntos em "(.*)"\.$/.exec(mensagem))) {
    return t('Contatos juntos em "{nome}".', {
      nome: m[1] === "o principal" ? t("o principal") : m[1],
    });
  }

  if (
    (m =
      /^Isso não parece um número de telefone: ficaram (\d+) dígitos e um número tem entre (\d+) e (\d+)\. Escreve só o número, sem o indicativo — o país escolhe-se ao lado\.$/.exec(
        mensagem,
      ))
  ) {
    return t(
      "Isso não parece um número de telefone: ficaram {n} dígitos e um número tem entre {min} e {max}. Digite só o número, sem o código do país — o país se escolhe ao lado.",
      { max: m[3], min: m[2], n: m[1] },
    );
  }

  return mensagem;
}

function diasDesde(iso: string | null) {
  if (!iso) {
    return null;
  }

  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  return Number.isFinite(dias) ? dias : null;
}

function Mensagem({ resultado }: { resultado: GravarClienteResultado | null }) {
  const { t } = useIdioma();

  if (!resultado) {
    return null;
  }

  return (
    <p
      className={`text-xs ${resultado.ok ? "text-positive" : "text-danger"}`}
      role="status"
    >
      {traduzirMensagem(resultado.mensagem, t)}
    </p>
  );
}

/**
 * O campo do telefone, com o país ao lado.
 *
 * A pré-visualização não é enfeite: é o único sítio onde o dono vê o número
 * exactamente como vai ficar gravado, antes de gravar. Foi assim que se
 * percebeu o problema que ela resolve — um número escrito sem indicativo
 * entrou na base e o aviso de duplicado deixou de o apanhar.
 */
function CampoTelefone() {
  const { t } = useIdioma();
  const [indicativo, setIndicativo] = useState(indicativoPorOmissao);
  const [numero, setNumero] = useState("");
  const montado = montarTelefone(indicativo, numero);
  const escreveu = numero.trim() !== "";

  return (
    <div className="flex min-w-64 flex-1 flex-col gap-1.5">
      <span className={labelTexto}>{t("Telefone")}</span>

      <div className="flex gap-2">
        <select
          aria-label={t("Código do país")}
          className={`${inputClass} max-w-36 shrink-0`}
          name="indicativo"
          onChange={(evento) => setIndicativo(evento.target.value)}
          value={indicativo}
        >
          {indicativosTelefone.map((entrada) => (
            <option key={entrada.codigo} value={entrada.codigo}>
              +{entrada.codigo} {t(entrada.pais)}
            </option>
          ))}
        </select>

        <input
          aria-label={t("Número de telefone")}
          className={`${inputClass} w-full min-w-0`}
          inputMode="tel"
          maxLength={32}
          name="telefone"
          onChange={(evento) => setNumero(evento.target.value)}
          placeholder="912345678"
          required
          type="tel"
          value={numero}
        />
      </div>

      <p
        className={`text-xs normal-case ${
          !escreveu
            ? "text-muted-foreground"
            : montado.erro
              ? "text-danger"
              : "text-muted-foreground"
        }`}
      >
        {!escreveu ? (
          comNos(
            t(
              "Digite o número sem o código do país. Se colar um número de outro país já completo, comece com {mais}.",
            ),
            { mais: <strong>+</strong> },
          )
        ) : montado.erro ? (
          traduzirMensagem(montado.erro, t)
        ) : (
          comNos(t("Vai ficar salvo como {numero}"), {
            numero: (
              <strong className="font-semibold text-foreground">
                {montado.digitos}
              </strong>
            ),
          })
        )}
      </p>
    </div>
  );
}

/**
 * Os campos que descrevem a pessoa, iguais a criar e a editar.
 *
 * São o mesmo componente nos dois sítios de propósito: dois formulários com os
 * mesmos campos escritos duas vezes acabam a divergir — um ganha um campo que o
 * outro não tem, e o dono nunca percebe porque é que a morada só se consegue
 * escrever ao criar.
 *
 * O `prefixo` existe só para os `id` dos rótulos. A ficha pode ter várias
 * instâncias abertas na mesma página e `id` repetido faz o clique no rótulo
 * saltar para o campo errado.
 */
function CamposDaPessoa({
  cliente,
  mostrarViatura,
  prefixo,
}: {
  cliente?: ClienteLinha;
  mostrarViatura: boolean;
  prefixo: string;
}) {
  const { t } = useIdioma();
  const [canal, setCanal] = useState(cliente?.origemManual ?? "");

  return (
    <>
      <label
        className={`${labelClass} min-w-48 flex-1`}
        htmlFor={`${prefixo}-email`}
      >
        {t("E-mail")}
        <input
          className={`${inputClass} w-full`}
          defaultValue={cliente?.email ?? ""}
          id={`${prefixo}-email`}
          maxLength={320}
          name="email"
          placeholder={t("opcional")}
          type="email"
        />
      </label>

      <label
        className={`${labelClass} min-w-48 flex-1`}
        htmlFor={`${prefixo}-morada`}
      >
        {t("Endereço")}
        <input
          className={`${inputClass} w-full`}
          defaultValue={cliente?.morada ?? ""}
          id={`${prefixo}-morada`}
          maxLength={512}
          name="morada"
          placeholder={t("opcional")}
          type="text"
        />
      </label>

      {mostrarViatura ? (
        <label
          className={`${labelClass} min-w-48 flex-1`}
          htmlFor={`${prefixo}-viatura`}
        >
          {t("Carro")}
          <input
            className={`${inputClass} w-full`}
            defaultValue={cliente?.viatura ?? ""}
            id={`${prefixo}-viatura`}
            maxLength={160}
            name="viatura"
            placeholder={t("ex.: BMW Série 3 preto")}
            type="text"
          />
        </label>
      ) : null}

      <label className={`${labelClass} w-28`} htmlFor={`${prefixo}-idade`}>
        {t("Idade")}
        <input
          className={`${inputClass} w-full`}
          defaultValue={cliente?.idade ?? ""}
          id={`${prefixo}-idade`}
          inputMode="numeric"
          max={120}
          min={1}
          name="idade"
          placeholder={t("opcional")}
          type="number"
        />
      </label>

      <label
        className={`${labelClass} min-w-48 flex-1`}
        htmlFor={`${prefixo}-origem`}
      >
        {t("Canal de aquisição")}
        <select
          className={`${inputClass} w-full`}
          id={`${prefixo}-origem`}
          name="origem_manual"
          onChange={(evento) => setCanal(evento.target.value)}
          value={canal}
        >
          <option value="">{t("Não sei")}</option>
          {canaisDeAquisicao.map((opcao) => (
            <option key={opcao.value} value={opcao.value}>
              {t(opcao.label)}
            </option>
          ))}
        </select>
      </label>

      {canal === canalQuePedeNota ? (
        <label
          className={`${labelClass} min-w-48 flex-1`}
          htmlFor={`${prefixo}-origem-nota`}
        >
          {t("De onde veio")}
          <input
            className={`${inputClass} w-full`}
            defaultValue={cliente?.origemManualNota ?? ""}
            id={`${prefixo}-origem-nota`}
            maxLength={200}
            name="origem_manual_nota"
            placeholder={t("ex.: feira de automóveis de Braga")}
            required
            type="text"
          />
        </label>
      ) : null}
    </>
  );
}

/**
 * O serviço que a pessoa já fez.
 *
 * O mesmo bloco serve os dois sítios — criar um cliente e registar mais um
 * serviço numa ficha que já existe — porque é a mesma venda e o mesmo
 * contrato. O `prefixo` existe porque os dois aparecem na mesma página: ids
 * repetidos no HTML fazem o rótulo ir buscar o campo errado.
 *
 * Isto não grava na ficha: grava em `marcacoes`, na base do próprio cliente,
 * que é de onde o histórico e o total gasto já vêm. Um campo "ticket" na ficha
 * era um segundo total a discordar do primeiro.
 *
 * Só aparece onde há catálogo. A Miranda não tem base de serviços ligada, e um
 * `<select>` sem opções parece um campo avariado.
 *
 * A data é do dia em que o serviço foi feito e não aceita futuro — isso é
 * recusado no servidor, com a razão. Uma marcação futura escrita aqui punha o
 * cliente a receber o lembrete automático de 24h antes para uma hora que não
 * está na agenda de ninguém.
 */
function CamposDoServico({
  executores,
  moeda,
  opcional,
  prefixo,
  servicos,
}: {
  executores: ExecutorOpcao[];
  moeda: string;
  opcional: boolean;
  prefixo: string;
  servicos: ServicoOpcao[];
}) {
  const { t } = useIdioma();

  if (servicos.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-wrap items-start gap-3 rounded-xl bg-surface-muted px-3 py-3">
      <p className="w-full text-xs text-muted-foreground">
        {t("Serviço já feito")}{" "}
        {opcional ? (
          <span className="text-muted-foreground/60">— {t("opcional")}</span>
        ) : null}
      </p>

      <label
        className={`${labelClass} min-w-48 flex-1`}
        htmlFor={`${prefixo}-servico-id`}
      >
        {t("Serviço")}
        <select
          className={`${inputClass} w-full`}
          id={`${prefixo}-servico-id`}
          name="servico_id"
        >
          <option value="">{t("Nenhum")}</option>
          {servicos.map((servico) => (
            <option key={servico.id} value={servico.id}>
              {servico.nome}
            </option>
          ))}
        </select>
      </label>

      <label
        className={`${labelClass} w-40`}
        htmlFor={`${prefixo}-servico-data`}
      >
        {t("Data")}
        <input
          className={`${inputClass} w-full`}
          id={`${prefixo}-servico-data`}
          name="servico_data"
          type="date"
        />
      </label>

      <label
        className={`${labelClass} w-32`}
        htmlFor={`${prefixo}-servico-valor`}
      >
        {t("Ticket ({moeda})", { moeda })}
        <input
          className={`${inputClass} w-full`}
          id={`${prefixo}-servico-valor`}
          inputMode="decimal"
          min={0}
          name="servico_valor"
          placeholder={t("opcional")}
          step="0.01"
          type="number"
        />
      </label>

      {executores.length > 0 ? (
        <label
          className={`${labelClass} w-36`}
          htmlFor={`${prefixo}-servico-executor`}
        >
          {t("Quem fez")}
          <select
            className={`${inputClass} w-full`}
            id={`${prefixo}-servico-executor`}
            name="servico_executor"
          >
            <option value="">{t("Não sei")}</option>
            {executores.map((executor) => (
              <option key={executor.chave} value={executor.chave}>
                {executor.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

/**
 * Criar um cliente à mão.
 *
 * O aviso de duplicado é um segundo passo e não um bloqueio: a primeira
 * submissão devolve a lista dos contactos com aquele número, e só depois
 * aparece o botão que insiste. O Arthur escolheu assim para não se decidir
 * pelo dono que duas linhas são a mesma pessoa.
 */
function CriarClienteForm({
  action,
  executores,
  moeda,
  mostrarViatura,
  servicos,
}: {
  action: ClienteAction;
  executores: ExecutorOpcao[];
  moeda: string;
  mostrarViatura: boolean;
  servicos: ServicoOpcao[];
}) {
  const [resultado, formAction] = useActionState<
    GravarClienteResultado | null,
    FormData
  >(action, null);
  const { t } = useIdioma();
  const duplicados = resultado?.duplicados ?? [];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <label
          className={`${labelClass} min-w-48 flex-1`}
          htmlFor="cliente-nome"
        >
          {t("Nome")}
          <input
            className={`${inputClass} w-full`}
            id="cliente-nome"
            maxLength={256}
            name="nome"
            placeholder={t("ex.: Martim Cordeiro")}
            required
            type="text"
          />
        </label>

        <CampoTelefone />

        <CamposDaPessoa mostrarViatura={mostrarViatura} prefixo="criar" />

        <label
          className={`${labelClass} min-w-48 flex-1`}
          htmlFor="cliente-notas"
        >
          {t("Notas")}
          <input
            className={`${inputClass} w-full`}
            id="cliente-notas"
            maxLength={4000}
            name="notas"
            placeholder={t("opcional")}
            type="text"
          />
        </label>

        <FormSubmitButton
          className={`${botaoPrimario} mt-5`}
          pendingLabel={t("Criando...")}
        >
          {t("Criar cliente")}
        </FormSubmitButton>

        <CamposDoServico
          executores={executores}
          moeda={moeda}
          opcional
          prefixo="criar"
          servicos={servicos}
        />
      </div>

      <Mensagem resultado={resultado} />

      {duplicados.length > 0 ? (
        <div className="rounded-xl bg-warning-soft px-3 py-3 text-xs text-warning">
          <p className="font-semibold">
            {t("Este número já está no painel, em outro formato ou em outro canal:")}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {duplicados.map((linha) => (
              <li key={linha.id}>
                {linha.nome || t("sem nome")} ·{" "}
                {linha.telefone || t("sem número")} · {linha.canal}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            {t(
              "Se for mesmo outra pessoa, crie de novo. Se for a mesma, cancele e use o \"Juntar a outro contato\" na ficha dela — assim as conversas e o histórico ficam todos no mesmo lugar.",
            )}
          </p>
          <div className="mt-3">
            <input name="confirmado" type="hidden" value="sim" />
            <FormSubmitButton
              className={botaoPrimario}
              pendingLabel={t("Criando...")}
            >
              {t("Criar mesmo assim")}
            </FormSubmitButton>
          </div>
        </div>
      ) : null}
    </form>
  );
}

/**
 * Editar a ficha de quem já está na base.
 *
 * Era só as notas. Sem isto, os campos novos só valiam para quem fosse criado
 * a partir de hoje — e a base já tem 1001 contactos no Detail e 573 na
 * Miranda, todos sem canal de aquisição.
 *
 * O nome e o telefone ficam de fora: o telefone é a chave que liga esta linha
 * ao histórico de marcações na outra base e ao aviso de duplicado. Mudá-lo num
 * campo de texto partia as duas coisas sem dizer nada.
 */
function FichaForm({
  action,
  cliente,
  mostrarViatura,
}: {
  action: ClienteAction;
  cliente: ClienteLinha;
  mostrarViatura: boolean;
}) {
  const [resultado, formAction] = useActionState<
    GravarClienteResultado | null,
    FormData
  >(action, null);
  const { t } = useIdioma();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="contacto_id" type="hidden" value={cliente.id} />

      <div className="flex flex-wrap items-start gap-3">
        <CamposDaPessoa
          cliente={cliente}
          mostrarViatura={mostrarViatura}
          prefixo={`ficha-${cliente.id}`}
        />
      </div>

      <label className={labelClass} htmlFor={`notas-${cliente.id}`}>
        {t("Notas")}
        <textarea
          className="min-h-20 rounded-2xl border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-foreground"
          defaultValue={cliente.notas ?? ""}
          id={`notas-${cliente.id}`}
          maxLength={4000}
          name="notas"
          placeholder={t("Preferências, o que deu certo ou errado.")}
        />
      </label>

      <div className="flex items-center gap-3">
        <FormSubmitButton
          className={botaoDiscreto}
          pendingLabel={t("Salvando...")}
        >
          {t("Salvar ficha")}
        </FormSubmitButton>
        <Mensagem resultado={resultado} />
      </div>
    </form>
  );
}

/**
 * Registar mais um serviço num cliente que já está no painel.
 *
 * É um formulário à parte do "Gravar ficha", e não mais uns campos lá dentro.
 * São dois actos diferentes — corrigir a morada não é vender — e em duas bases
 * de dados diferentes. Juntos num botão só, cada correcção de email registava
 * uma venda.
 *
 * O aviso é o que o Arthur pediu e é a única trava: quem já tem serviços na
 * agenda vê-os listados e tem de insistir. Não bloqueia — um cliente que volta
 * três vezes no mesmo mês é um bom cliente, não um engano — mas põe o que já
 * lá está à frente dos olhos, que é o que faz ver o serviço repetido antes de
 * ele ser escrito duas vezes.
 */
function ServicoNaFichaForm({
  action,
  cliente,
  executores,
  moeda,
  servicos,
  timeZone,
}: {
  action: ClienteAction;
  cliente: ClienteLinha;
  executores: ExecutorOpcao[];
  moeda: string;
  servicos: ServicoOpcao[];
  timeZone: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarClienteResultado | null,
    FormData
  >(action, null);
  const { locale, t } = useIdioma();
  const jaRegistados = resultado?.jaRegistados ?? [];

  if (servicos.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input name="contacto_id" type="hidden" value={cliente.id} />

      <CamposDoServico
        executores={executores}
        moeda={moeda}
        opcional={false}
        prefixo={`ficha-${cliente.id}`}
        servicos={servicos}
      />

      <div className="flex items-center gap-3">
        <FormSubmitButton
          className={botaoDiscreto}
          pendingLabel={t("Registrando...")}
        >
          {t("Registrar serviço")}
        </FormSubmitButton>
        <Mensagem resultado={resultado} />
      </div>

      {jaRegistados.length > 0 ? (
        <div className="rounded-xl bg-warning-soft px-3 py-3 text-xs text-warning">
          <p className="font-semibold">
            {t("{nome} já tem isto registrado:", { nome: cliente.nome })}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {jaRegistados.map((linha) => (
              <li key={linha.id}>
                {formatarDia(linha.dataInicio, timeZone, locale)} ·{" "}
                {linha.nome ?? t("serviço não registrado")} ·{" "}
                {linha.valor === null
                  ? "—"
                  : formatMoeda(linha.valor, moeda, locale)}
                {linha.estado === "cancelada" ? ` · ${t("cancelada")}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            {t(
              "Se o serviço que você está registrando já está nesta lista, cancele — ele conta duas vezes para o total gasto e o número deixa de valer. Se é mesmo mais um, continue.",
            )}
          </p>
          <div className="mt-3">
            <input name="confirmado" type="hidden" value="sim" />
            <FormSubmitButton
              className={botaoDiscreto}
              pendingLabel={t("Registrando...")}
            >
              {t("Registrar mesmo assim")}
            </FormSubmitButton>
          </div>
        </div>
      ) : null}
    </form>
  );
}

/**
 * Por onde é que esta pessoa chegou.
 *
 * As duas respostas aparecem lado a lado quando ambas existem, e cada uma diz
 * de onde vem. Não é pedantismo: a que a Meta confirmou existe em 3% dos
 * contactos (26 em 1001 no Detail, medido a 2026-10-16) e é a única que serve
 * para julgar o custo de uma campanha. A que o dono escolheu cobre o resto,
 * mas é memória. Mostrá-las como se fossem a mesma coisa fazia a segunda
 * contaminar a primeira.
 */
function OrigemDoCliente({ cliente }: { cliente: ClienteLinha }) {
  const { t } = useIdioma();
  const capturadaBruta = getOrigemCapturadaLabel(cliente.origemCapturada);
  const manualBruto = getCanalLabel(cliente.origemManual);
  const capturada = capturadaBruta ? t(capturadaBruta) : null;
  const manual = manualBruto ? t(manualBruto) : null;
  const anuncio = cliente.anuncio;

  if (!capturada && !manual && !anuncio) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {capturada ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/20 bg-positive-soft px-2.5 py-1 font-medium text-positive">
            {capturada}
            <span className="font-normal text-positive/80">
              {t("confirmado")}
            </span>
          </span>
        ) : null}
        {manual ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-medium text-muted-foreground">
            {manual}
            {cliente.origemManualNota ? ` · ${cliente.origemManualNota}` : ""}
            <span className="font-normal text-muted-foreground">
              {t("indicado")}
            </span>
          </span>
        ) : null}
      </div>

      {/*
        O anúncio, quando a Meta o mandou. Em três linhas e não numa etiqueta:
        os nomes que o cliente escreve no Gestor de Anúncios são compridos
        — "FB+IG - advt+ ab [Lisboa 40km] 22-55 - Higien" — e numa etiqueta
        redonda ficavam cortados logo no primeiro.
      */}
      {anuncio ? (
        <dl className="rounded-lg border border-positive/20 bg-positive-soft px-3 py-2 text-xs">
          {[
            { rotulo: t("Campanha"), valor: anuncio.campanhaNome },
            { rotulo: t("Conjunto"), valor: anuncio.conjuntoNome },
            { rotulo: t("Criativo"), valor: anuncio.criativoNome },
          ]
            .filter((linha) => linha.valor)
            .map((linha) => (
              <div className="flex gap-2 py-0.5" key={linha.rotulo}>
                <dt className="w-20 shrink-0 text-positive/80">
                  {linha.rotulo}
                </dt>
                <dd className="min-w-0 font-medium break-words text-foreground">
                  {linha.valor}
                </dd>
              </div>
            ))}
        </dl>
      ) : null}
    </div>
  );
}

/** A ficha para quem não pode editar: os mesmos campos, só que escritos. */
function CamposEmLeitura({
  cliente,
  mostrarViatura,
}: {
  cliente: ClienteLinha;
  mostrarViatura: boolean;
}) {
  const { t } = useIdioma();
  const linhas = [
    { rotulo: t("E-mail"), valor: cliente.email },
    { rotulo: t("Endereço"), valor: cliente.morada },
    ...(mostrarViatura ? [{ rotulo: t("Carro"), valor: cliente.viatura }] : []),
    {
      rotulo: t("Idade"),
      valor: cliente.idade === null ? null : String(cliente.idade),
    },
  ].filter((linha) => linha.valor);

  if (linhas.length === 0 && !cliente.notas) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {linhas.length > 0 ? (
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          {linhas.map((linha) => (
            <div key={linha.rotulo}>
              <dt className="text-muted-foreground">{linha.rotulo}</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                {linha.valor}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {cliente.notas ? (
        <p className="text-sm whitespace-pre-line text-muted-foreground">
          {cliente.notas}
        </p>
      ) : null}
    </div>
  );
}

/** Um candidato a contacto principal, na lista de sugestões ou de procura. */
function OpcaoDeJuntar({
  aoEscolher,
  mesmoNumero,
  outro,
}: {
  aoEscolher: () => void;
  mesmoNumero: boolean;
  outro: ClienteLinha;
}) {
  const { t } = useIdioma();

  return (
    <button
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left transition hover:border-border-strong hover:bg-surface"
      onClick={aoEscolher}
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {outro.nome}
        </span>
        <span className="block text-xs text-muted-foreground">
          {outro.telefone}
        </span>
      </span>
      {mesmoNumero ? (
        <span className="ds-selo ds-selo-alerta shrink-0">
          {t("mesmo número")}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Juntar este contacto a outro.
 *
 * Era um `<select>` com os 341 clientes lá dentro, e era impossível de usar.
 * Agora: os contactos com o MESMO número aparecem sugeridos — que é o caso
 * real, porque os duplicados nasceram todos de a Meta entregar o número em
 * dois formatos — e para o resto escreve-se o nome.
 *
 * Quem é escolhido fica com a ficha; este passa a aparecer por baixo dele.
 * Nada é apagado, e por isso separar é possível a qualquer momento.
 */
function JuntarForm({
  action,
  cliente,
  outros,
}: {
  action: ClienteAction;
  cliente: ClienteLinha;
  outros: ClienteLinha[];
}) {
  const [resultado, formAction] = useActionState<
    GravarClienteResultado | null,
    FormData
  >(action, null);
  const { t } = useIdioma();
  const [procura, setProcura] = useState("");
  const [escolhido, setEscolhido] = useState<ClienteLinha | null>(null);

  const sugeridos = useMemo(
    () =>
      outros.filter(
        (outro) =>
          outro.telefoneDigitos !== "" &&
          outro.telefoneDigitos === cliente.telefoneDigitos,
      ),
    [cliente.telefoneDigitos, outros],
  );

  const encontrados = useMemo(() => {
    const alvo = procura.trim().toLowerCase();

    if (alvo === "") {
      return [];
    }

    const digitos = alvo.replace(/\D/g, "");

    return outros
      .filter(
        (outro) =>
          outro.nome.toLowerCase().includes(alvo) ||
          (digitos !== "" && outro.telefoneDigitos.includes(digitos)),
      )
      .slice(0, 8);
  }, [outros, procura]);

  if (outros.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-muted-foreground">
        {t("Juntar a outro contato")}
      </p>

      {escolhido ? (
        <form action={formAction} className="flex flex-col gap-2">
          <input name="duplicado_id" type="hidden" value={cliente.id} />
          <input name="principal_id" type="hidden" value={escolhido.id} />

          <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
            {comNos(t("{nome} passa a aparecer dentro da ficha de {principal}"), {
              nome: <span className="font-semibold">{cliente.nome}</span>,
              principal: (
                <span className="font-semibold">{escolhido.nome}</span>
              ),
            })}{" "}
            · {escolhido.telefone}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <ConfirmSubmitButton
              className={botaoDiscreto}
              confirmMessage={t(
                'Juntar "{nome}" a "{principal}"? Esta ficha deixa de aparecer sozinha. Pode ser desfeito.',
                { nome: cliente.nome, principal: escolhido.nome },
              )}
              pendingLabel={t("Juntando...")}
            >
              {t("Juntar")}
            </ConfirmSubmitButton>
            <button
              className={botaoDiscreto}
              onClick={() => setEscolhido(null)}
              type="button"
            >
              {t("Escolher outro")}
            </button>
            <Mensagem resultado={resultado} />
          </div>
        </form>
      ) : (
        <>
          {sugeridos.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-warning">
                {sugeridos.length === 1
                  ? t(
                      "Há um contato com este mesmo número. É quase certeza que é a mesma pessoa.",
                    )
                  : t("Há {n} contatos com este mesmo número.", {
                      n: sugeridos.length,
                    })}
              </p>
              {sugeridos.map((outro) => (
                <OpcaoDeJuntar
                  aoEscolher={() => setEscolhido(outro)}
                  key={outro.id}
                  mesmoNumero
                  outro={outro}
                />
              ))}
            </div>
          ) : null}

          <input
            aria-label={t("Buscar o contato principal")}
            className={`${inputClass} w-full`}
            onChange={(evento) => setProcura(evento.target.value)}
            placeholder={t("Buscar por nome ou número...")}
            type="search"
            value={procura}
          />

          {procura.trim() !== "" ? (
            encontrados.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("Nenhum contato corresponde a essa busca.")}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {encontrados.map((outro) => (
                  <OpcaoDeJuntar
                    aoEscolher={() => setEscolhido(outro)}
                    key={outro.id}
                    mesmoNumero={
                      outro.telefoneDigitos === cliente.telefoneDigitos
                    }
                    outro={outro}
                  />
                ))}
              </div>
            )
          ) : null}

          <Mensagem resultado={resultado} />
        </>
      )}
    </div>
  );
}

function SepararForm({
  action,
  duplicadoId,
}: {
  action: ClienteAction;
  duplicadoId: string;
}) {
  const [resultado, formAction] = useActionState<
    GravarClienteResultado | null,
    FormData
  >(action, null);
  const { t } = useIdioma();

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input name="duplicado_id" type="hidden" value={duplicadoId} />
      <FormSubmitButton
        className={botaoDiscreto}
        pendingLabel={t("Separando...")}
      >
        {t("Separar")}
      </FormSubmitButton>
      <Mensagem resultado={resultado} />
    </form>
  );
}

/** A linha da tabela: o que se vê sem abrir nada. */
function LinhaDoCliente({
  aberto,
  aoAlternar,
  cliente,
  marcada,
  moeda,
  timeZone,
}: {
  aberto: boolean;
  aoAlternar: () => void;
  cliente: ClienteLinha;
  marcada: boolean;
  moeda: string;
  timeZone: string;
}) {
  const { locale, t } = useIdioma();
  const dias = diasDesde(cliente.mensagemUltima);

  return (
    <button
      aria-expanded={aberto}
      className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition hover:bg-surface-muted sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] ${
        aberto ? "bg-surface-muted" : ""
      }`}
      onClick={aoAlternar}
      type="button"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {cliente.nome}
          </span>
          {marcada ? (
            <span className="ds-selo ds-selo-alerta shrink-0">
              {t("duplicado")}
            </span>
          ) : null}
          {cliente.juntos.length > 0 ? (
            <span className="ds-selo ds-selo-neutro shrink-0">
              {t("+{n} junto", { n: cliente.juntos.length })}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:hidden">
          {cliente.telefone} ·{" "}
          {formatarDia(cliente.mensagemUltima, timeZone, locale)}
        </span>
      </span>

      <span className="hidden truncate text-xs text-muted-foreground sm:block">
        {cliente.telefone}
      </span>

      <span className="hidden text-xs text-muted-foreground sm:block">
        {dias === null
          ? "—"
          : dias === 1
            ? t("há 1 dia")
            : t("há {n} dias", { n: dias })}
      </span>

      <span className="hidden text-xs text-muted-foreground sm:block">
        {t("{n} msg", { n: cliente.mensagens })}
      </span>

      <span className="flex shrink-0 items-center justify-end gap-2">
        <span className="text-sm font-semibold text-foreground">
          {cliente.totalGasto === null
            ? "—"
            : formatMoeda(cliente.totalGasto, moeda, locale)}
        </span>
        {/*
          A seta é o que diz que a linha abre — e, virada ao contrário, que
          volta a fechar. Sem ela a ficha parecia não ter saída.
        */}
        <svg
          aria-hidden="true"
          className={`h-4 w-4 text-muted-foreground/60 transition-transform ${
            aberto ? "rotate-180" : ""
          }`}
          viewBox="0 0 20 20"
        >
          <path
            d="M5.5 7.5L10 12l4.5-4.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </span>
    </button>
  );
}

/** A ficha aberta, por baixo da linha. */
function FichaDoCliente({
  actionFicha,
  actionJuntar,
  actionSeparar,
  actionServico,
  aoFechar,
  cliente,
  executores,
  moeda,
  mostrarViatura,
  outros,
  podeEditar,
  servicos,
  timeZone,
}: {
  actionFicha: ClienteAction;
  actionJuntar: ClienteAction;
  actionSeparar: ClienteAction;
  actionServico: ClienteAction;
  aoFechar: () => void;
  cliente: ClienteLinha;
  executores: ExecutorOpcao[];
  moeda: string;
  mostrarViatura: boolean;
  outros: ClienteLinha[];
  podeEditar: boolean;
  servicos: ServicoOpcao[];
  timeZone: string;
}) {
  const { locale, t } = useIdioma();

  return (
    <div className="flex flex-col gap-4 border-t border-border bg-surface-muted px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {cliente.canais.map((canal) => (
          <ChannelBadge channel={canal} key={canal} />
        ))}
        {cliente.telefoneDigitos ? (
          <a
            className="inline-flex min-h-9 items-center rounded-full bg-[#25D366] px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-95"
            href={`https://wa.me/${cliente.telefoneDigitos}`}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t("Abrir no WhatsApp")}
          </a>
        ) : null}
        {/*
          O `wa.me` abre o telemóvel do dono e só serve para responder. Isto
          abre o histórico que a plataforma já tem — e nos contactos de
          Instagram ou Messenger, onde não há número, é a única forma de ler a
          conversa. Sem `periodo` de propósito: a página das conversas abre a
          conversa pedida mesmo que a última mensagem seja de há meses.
        */}
        <Link
          className="ds-botao ds-botao-primario"
          href={buildAppConversationHref(cliente.identificadorConversa, null)}
        >
          {t("Ir para a conversa na plataforma")}
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">{t("Última mensagem")}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">
            {formatarDia(cliente.mensagemUltima, timeZone, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Mensagens")}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">
            {cliente.mensagens}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Primeiro contato")}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">
            {formatarDia(cliente.primeiroContactoEm, timeZone, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Agendamentos")}</dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">
            {cliente.totalGasto === null ? "—" : cliente.historico.length}
          </dd>
        </div>
      </dl>

      <OrigemDoCliente cliente={cliente} />

      {podeEditar ? (
        <FichaForm
          action={actionFicha}
          cliente={cliente}
          mostrarViatura={mostrarViatura}
        />
      ) : (
        <CamposEmLeitura cliente={cliente} mostrarViatura={mostrarViatura} />
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          {t("Histórico")}
        </p>
        {cliente.totalGasto === null ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Os agendamentos ficam no banco de dados do cliente, e ele não está conectado neste ambiente.",
            )}
          </p>
        ) : cliente.historico.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Nunca agendou nada. Falou com o agente mas não fechou — é exatamente quem vale a pena contatar de novo.",
            )}
          </p>
        ) : (
          <ul className="mt-2">
            {cliente.historico.map((linha) => (
              <li
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-1.5 last:border-b-0"
                key={linha.id}
              >
                <span className="text-xs text-muted-foreground">
                  {formatarDia(linha.dataInicio, timeZone, locale)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {linha.servico ?? t("serviço não registrado")}
                  {linha.viatura ? ` · ${linha.viatura}` : ""}
                  {linha.estado === "cancelada" ? ` · ${t("cancelada")}` : ""}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    linha.estado === "cancelada"
                      ? "text-muted-foreground/60 line-through"
                      : "text-foreground"
                  }`}
                >
                  {linha.valor === null
                    ? "—"
                    : formatMoeda(linha.valor, moeda, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/*
          Por baixo da lista e não por cima: o aviso de repetição só serve
          se o que já lá está estiver à vista no momento de escrever.
          `totalGasto === null` é "não sabemos" e não "nunca comprou" — sem
          base ligada não há onde escrever, e o formulário não aparece.
        */}
        {podeEditar && cliente.totalGasto !== null ? (
          <div className="mt-3">
            <ServicoNaFichaForm
              action={actionServico}
              cliente={cliente}
              executores={executores}
              moeda={moeda}
              servicos={servicos}
              timeZone={timeZone}
            />
          </div>
        ) : null}
      </div>

      {cliente.juntos.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            {t("Contatos juntos a este")}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {cliente.juntos.map((junto) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0"
                key={junto.id}
              >
                <span className="text-xs text-muted-foreground">
                  {junto.canal} ·{" "}
                  {junto.telefone || junto.identificadorConversa}
                </span>
                {podeEditar ? (
                  <SepararForm action={actionSeparar} duplicadoId={junto.id} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {podeEditar ? (
        <JuntarForm action={actionJuntar} cliente={cliente} outros={outros} />
      ) : null}

      {/*
        Com notas, histórico e o escolhedor de juntar, a ficha é mais alta do
        que o ecrã. Fechar pela linha obriga a rolar para cima à procura dela;
        isto fecha onde a leitura acaba.
      */}
      <div>
        <button
          className="ds-botao ds-botao-secundario"
          onClick={aoFechar}
          type="button"
        >
          <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 20 20">
            <path
              d="M14.5 12.5L10 8l-4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
          {t("Fechar ficha")}
        </button>
      </div>
    </div>
  );
}

export function ClientesPanel({
  actionCriar,
  actionFicha,
  actionJuntar,
  actionSeparar,
  actionServico,
  clientes,
  deFora,
  executores,
  historicoLigado,
  moeda,
  mostrarViatura,
  podeEditar,
  servicos,
  timeZone,
}: {
  actionCriar: ClienteAction;
  actionFicha: ClienteAction;
  actionJuntar: ClienteAction;
  actionSeparar: ClienteAction;
  actionServico: ClienteAction;
  clientes: ClienteLinha[];
  deFora: ClientesDeFora;
  /** Quem executa, para dizer quem fez o serviço registado à mão. */
  executores: ExecutorOpcao[];
  historicoLigado: boolean;
  moeda: string;
  /** O campo "Carro" só faz sentido onde se tratam carros. */
  mostrarViatura: boolean;
  podeEditar: boolean;
  /**
   * O catálogo do cliente. Vazio esconde o bloco do serviço — é o caso da
   * Miranda, que não tem base de serviços ligada.
   */
  servicos: ServicoOpcao[];
  /**
   * O fuso do cliente. É obrigatório porque isto corre nos dois lados: o
   * servidor da Vercel está em UTC e o browser do dono não, e uma data
   * formatada sem fuso saía diferente em cada um — a hidratação queixava-se e
   * o dia mostrado podia estar errado.
   */
  timeZone: string;
}) {
  const { t } = useIdioma();
  const [procura, setProcura] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aCriar, setACriar] = useState(false);

  // Os ids que partilham o número com outro cliente. É o trabalho por fazer
  // que a lista tem, e por isso tem direito a um filtro e a uma etiqueta.
  const duplicados = useMemo(() => {
    const porDigitos = new Map<string, string[]>();

    for (const cliente of clientes) {
      if (cliente.telefoneDigitos === "") {
        continue;
      }

      porDigitos.set(cliente.telefoneDigitos, [
        ...(porDigitos.get(cliente.telefoneDigitos) ?? []),
        cliente.id,
      ]);
    }

    return new Set(
      [...porDigitos.values()].filter((ids) => ids.length > 1).flat(),
    );
  }, [clientes]);

  const filtrados = useMemo(() => {
    const alvo = procura.trim().toLowerCase();
    const digitos = alvo.replace(/\D/g, "");

    return clientes.filter((cliente) => {
      if (
        alvo !== "" &&
        !cliente.nome.toLowerCase().includes(alvo) &&
        !(digitos !== "" && cliente.telefoneDigitos.includes(digitos))
      ) {
        return false;
      }

      if (filtro === "duplicados") {
        return duplicados.has(cliente.id);
      }

      if (filtro === "semNotas") {
        return !cliente.notas;
      }

      if (filtro === "parados") {
        const dias = diasDesde(cliente.mensagemUltima);

        return dias === null || dias >= diasParaParado;
      }

      return true;
    });
  }, [clientes, duplicados, filtro, procura]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  // A página pode ficar para lá do fim quando o filtro encolhe a lista.
  const paginaActual = Math.min(pagina, paginas - 1);
  const visiveis = filtrados.slice(
    paginaActual * porPagina,
    paginaActual * porPagina + porPagina,
  );

  function mudarFiltro(novo: Filtro) {
    setFiltro(novo);
    setPagina(0);
  }

  const chips: { contagem: number; id: Filtro; rotulo: string }[] = [
    { contagem: clientes.length, id: "todos", rotulo: t("Todos") },
    { contagem: duplicados.size, id: "duplicados", rotulo: t("Duplicados") },
    {
      contagem: clientes.filter((cliente) => {
        const dias = diasDesde(cliente.mensagemUltima);

        return dias === null || dias >= diasParaParado;
      }).length,
      id: "parados",
      rotulo: t("Sem falar há {n}+ dias", { n: diasParaParado }),
    },
    {
      contagem: clientes.filter((cliente) => !cliente.notas).length,
      id: "semNotas",
      rotulo: t("Sem notas"),
    },
  ];

  return (
    <>
      {podeEditar ? (
        <div className={cartao}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SeccaoTitulo>{t("Novo cliente")}</SeccaoTitulo>
            <button
              className={botaoDiscreto}
              onClick={() => setACriar((anterior) => !anterior)}
              type="button"
            >
              {aCriar ? t("Fechar") : t("Criar cliente")}
            </button>
          </div>

          {aCriar ? (
            <>
              <p className="mt-3 text-xs text-muted-foreground">
                {t(
                  "Fica no WhatsApp. É o único canal onde o número é também o identificador da conversa, por isso o contato se liga à conversa real assim que a pessoa escrever.",
                )}
              </p>
              <div className="mt-3">
                <CriarClienteForm
                  action={actionCriar}
                  executores={executores}
                  moeda={moeda}
                  mostrarViatura={mostrarViatura}
                  servicos={servicos}
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {duplicados.size > 0 && filtro !== "duplicados" ? (
        <button
          className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-left text-xs text-warning transition hover:brightness-95"
          onClick={() => mudarFiltro("duplicados")}
          type="button"
        >
          <span>
            {comNos(
              t(
                "{contatos} compartilham o número com outro. São a mesma pessoa duas vezes, porque a Meta entregou o número em dois formatos.",
              ),
              {
                contatos: (
                  <span className="font-semibold">
                    {t("{n} contatos", { n: duplicados.size })}
                  </span>
                ),
              },
            )}
          </span>
          <span className="font-semibold underline">{t("Ver só esses")}</span>
        </button>
      ) : null}

      <div className={cartao}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label
            className={`${labelClass} min-w-64 flex-1`}
            htmlFor="procurar-cliente"
          >
            {t("Buscar por nome ou número")}
            <input
              className={`${inputClass} w-full`}
              id="procurar-cliente"
              onChange={(evento) => {
                setProcura(evento.target.value);
                setPagina(0);
              }}
              placeholder={t("ex.: Martim, ou 912345678")}
              type="search"
              value={procura}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {t("{n} de {total} clientes", {
              n: filtrados.length,
              total: clientes.length,
            })}
          </p>
          {/*
            Ao lado da contagem de propósito. O botão exporta `filtrados` — o
            que a procura e os chips deixaram — e não os 939 todos, e é essa
            contagem que está escrita aqui ao lado. Sem o número à vista, quem
            filtrou e exportou não sabia o que ia no ficheiro.
          */}
          <BotaoExportar
            assunto="clientes"
            colunas={colunasDeClientes(moeda, mostrarViatura, timeZone)}
            linhas={filtrados}
          />
        </div>

        <div className="ds-trilho mt-3 max-w-full flex-wrap">
          {chips.map((chip) => (
            <button
              aria-pressed={filtro === chip.id}
              key={chip.id}
              onClick={() => mudarFiltro(chip.id)}
              type="button"
            >
              {chip.rotulo} ({chip.contagem})
            </button>
          ))}
        </div>
      </div>

      {!historicoLigado ? (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
          {t(
            "O histórico de agendamentos não está disponível: faltam as credenciais do banco de dados deste cliente neste ambiente. Os nomes, números e notas aparecem; os valores não.",
          )}
        </p>
      ) : null}

      {filtrados.length === 0 ? (
        <div className={cartao}>
          <p className="text-sm text-muted-foreground">
            {clientes.length === 0
              ? t("Ainda não há clientes com nome e número de telefone.")
              : t("Nenhum cliente corresponde a essa busca.")}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-x-4 border-b border-border bg-surface-muted px-4 py-2 text-[11px] font-semibold text-muted-foreground sm:grid">
            <span>{t("Nome")}</span>
            <span>{t("Telefone")}</span>
            <span>{t("Última mensagem")}</span>
            <span>{t("Mensagens")}</span>
            <span className="text-right">{t("Gasto")}</span>
          </div>

          <ul>
            {visiveis.map((cliente) => (
              <li
                className="border-b border-border last:border-b-0"
                key={cliente.id}
              >
                <LinhaDoCliente
                  aberto={aberto === cliente.id}
                  aoAlternar={() =>
                    setAberto((anterior) =>
                      anterior === cliente.id ? null : cliente.id,
                    )
                  }
                  cliente={cliente}
                  marcada={duplicados.has(cliente.id)}
                  moeda={moeda}
                  timeZone={timeZone}
                />

                {aberto === cliente.id ? (
                  <FichaDoCliente
                    actionFicha={actionFicha}
                    actionJuntar={actionJuntar}
                    actionSeparar={actionSeparar}
                    actionServico={actionServico}
                    aoFechar={() => setAberto(null)}
                    cliente={cliente}
                    executores={executores}
                    moeda={moeda}
                    mostrarViatura={mostrarViatura}
                    outros={clientes.filter((outro) => outro.id !== cliente.id)}
                    podeEditar={podeEditar}
                    servicos={servicos}
                    timeZone={timeZone}
                  />
                ) : null}
              </li>
            ))}
          </ul>

          {paginas > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-2.5">
              <button
                className={botaoDiscreto}
                disabled={paginaActual === 0}
                onClick={() => setPagina(paginaActual - 1)}
                type="button"
              >
                {t("Anterior")}
              </button>
              <span className="text-xs text-muted-foreground">
                {t("Página {n} de {total}", {
                  n: paginaActual + 1,
                  total: paginas,
                })}
              </span>
              <button
                className={botaoDiscreto}
                disabled={paginaActual >= paginas - 1}
                onClick={() => setPagina(paginaActual + 1)}
                type="button"
              >
                {t("Próxima")}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {deFora.semTelefoneReal + deFora.semNome > 0 ? (
        <div className={cartao}>
          <SeccaoTitulo>{t("Contatos que não entram na lista")}</SeccaoTitulo>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            {deFora.semTelefoneReal > 0 ? (
              <li>
                {comNos(
                  t(
                    "{n} sem número de telefone válido. São quase todos de Instagram e Messenger: nesses canais a Meta não dá o celular, dá um identificador interno. Quem agendou por lá deu o número ao agente, e esse número está no agendamento — não no contato.",
                  ),
                  {
                    n: (
                      <span className="font-semibold">
                        {deFora.semTelefoneReal}
                      </span>
                    ),
                  },
                )}
              </li>
            ) : null}
            {deFora.semNome > 0 ? (
              <li>
                {comNos(
                  t(
                    "{n} com número mas sem nome: a conversa não chegou ao ponto de o agente perguntar como a pessoa se chama.",
                  ),
                  {
                    n: <span className="font-semibold">{deFora.semNome}</span>,
                  },
                )}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </>
  );
}
