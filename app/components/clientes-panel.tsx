"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { ChannelBadge } from "@/app/components/channel-brand";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { buildAppConversationHref } from "@/app/components/feedback-conversation-utils";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import type { ClienteLinha, ClientesDeFora } from "@/lib/clientes/read";
import {
  indicativoPorOmissao,
  indicativosTelefone,
  montarTelefone,
} from "@/lib/clientes/telefone";
import type { GravarClienteResultado } from "@/lib/clientes/write";

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

type Filtro = "duplicados" | "parados" | "semNotas" | "todos";

/** Sem falar há mais do que isto, para o filtro dos parados. */
const diasParaParado = 90;
const porPagina = 25;

const inputClass =
  "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 disabled:bg-zinc-50 disabled:text-zinc-500";

const labelTexto =
  "text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase";

const labelClass = `flex flex-col gap-1.5 ${labelTexto}`;

const botaoPrimario =
  "inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60";

const botaoDiscreto =
  "inline-flex min-h-8 items-center rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-60";

const cartao =
  "rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]";

function formatData(iso: string | null) {
  if (!iso) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function formatMoeda(valor: number, moeda: string) {
  return new Intl.NumberFormat("pt-PT", {
    currency: moeda,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(valor);
}

function diasDesde(iso: string | null) {
  if (!iso) {
    return null;
  }

  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  return Number.isFinite(dias) ? dias : null;
}

function Mensagem({ resultado }: { resultado: GravarClienteResultado | null }) {
  if (!resultado) {
    return null;
  }

  return (
    <p
      className={`text-xs ${resultado.ok ? "text-emerald-700" : "text-red-700"}`}
      role="status"
    >
      {resultado.mensagem}
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
  const [indicativo, setIndicativo] = useState(indicativoPorOmissao);
  const [numero, setNumero] = useState("");
  const montado = montarTelefone(indicativo, numero);
  const escreveu = numero.trim() !== "";

  return (
    <div className="flex min-w-64 flex-1 flex-col gap-1.5">
      <span className={labelTexto}>Telefone</span>

      <div className="flex gap-2">
        <select
          aria-label="Indicativo do país"
          className={`${inputClass} w-36 shrink-0`}
          name="indicativo"
          onChange={(evento) => setIndicativo(evento.target.value)}
          value={indicativo}
        >
          {indicativosTelefone.map((entrada) => (
            <option key={entrada.codigo} value={entrada.codigo}>
              +{entrada.codigo} {entrada.pais}
            </option>
          ))}
        </select>

        <input
          aria-label="Número de telefone"
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
            ? "text-zinc-500"
            : montado.erro
              ? "text-red-700"
              : "text-zinc-600"
        }`}
      >
        {!escreveu ? (
          <>
            Escreve o número sem o indicativo. Se colares um número de outro
            país já completo, começa-o com <strong>+</strong>.
          </>
        ) : montado.erro ? (
          montado.erro
        ) : (
          <>
            Vai ficar gravado como{" "}
            <strong className="font-semibold text-zinc-900">
              {montado.digitos}
            </strong>
          </>
        )}
      </p>
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
function CriarClienteForm({ action }: { action: ClienteAction }) {
  const [resultado, formAction] = useActionState<
    GravarClienteResultado | null,
    FormData
  >(action, null);
  const duplicados = resultado?.duplicados ?? [];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <label className={`${labelClass} min-w-48 flex-1`} htmlFor="cliente-nome">
          Nome
          <input
            className={`${inputClass} w-full`}
            id="cliente-nome"
            maxLength={256}
            name="nome"
            placeholder="ex.: Martim Cordeiro"
            required
            type="text"
          />
        </label>

        <CampoTelefone />

        <label className={`${labelClass} min-w-48 flex-1`} htmlFor="cliente-notas">
          Notas
          <input
            className={`${inputClass} w-full`}
            id="cliente-notas"
            maxLength={4000}
            name="notas"
            placeholder="opcional"
            type="text"
          />
        </label>

        <FormSubmitButton
          className={`${botaoPrimario} mt-5`}
          pendingLabel="A criar..."
        >
          Criar cliente
        </FormSubmitButton>
      </div>

      <Mensagem resultado={resultado} />

      {duplicados.length > 0 ? (
        <div className="rounded-xl bg-amber-50 px-3 py-3 text-xs text-amber-900">
          <p className="font-semibold">
            Este número já está no painel, noutro formato ou noutro canal:
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {duplicados.map((linha) => (
              <li key={linha.id}>
                {linha.nome || "sem nome"} · {linha.telefone || "sem número"} ·{" "}
                {linha.canal}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Se for mesmo outra pessoa, cria de novo. Se for a mesma, cancela e
            usa o &quot;Juntar a outro contacto&quot; na ficha dela — assim as
            conversas e o histórico ficam todos no mesmo sítio.
          </p>
          <div className="mt-3">
            <input name="confirmado" type="hidden" value="sim" />
            <FormSubmitButton
              className={botaoPrimario}
              pendingLabel="A criar..."
            >
              Criar mesmo assim
            </FormSubmitButton>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function NotasForm({
  action,
  cliente,
}: {
  action: ClienteAction;
  cliente: ClienteLinha;
}) {
  const [resultado, formAction] = useActionState<
    GravarClienteResultado | null,
    FormData
  >(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input name="contacto_id" type="hidden" value={cliente.id} />

      <label className={labelClass} htmlFor={`notas-${cliente.id}`}>
        Notas
        <textarea
          className="min-h-20 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-950"
          defaultValue={cliente.notas ?? ""}
          id={`notas-${cliente.id}`}
          maxLength={4000}
          name="notas"
          placeholder="Carro, preferências, o que correu bem ou mal."
        />
      </label>

      <div className="flex items-center gap-3">
        <FormSubmitButton className={botaoDiscreto} pendingLabel="A gravar...">
          Gravar notas
        </FormSubmitButton>
        <Mensagem resultado={resultado} />
      </div>
    </form>
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
  return (
    <button
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-left transition hover:border-zinc-400 hover:bg-white"
      onClick={aoEscolher}
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-zinc-900">
          {outro.nome}
        </span>
        <span className="block text-xs text-zinc-500">{outro.telefone}</span>
      </span>
      {mesmoNumero ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
          mesmo número
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
      <p className="text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
        Juntar a outro contacto
      </p>

      {escolhido ? (
        <form action={formAction} className="flex flex-col gap-2">
          <input name="duplicado_id" type="hidden" value={cliente.id} />
          <input name="principal_id" type="hidden" value={escolhido.id} />

          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <span className="font-semibold">{cliente.nome}</span> passa a
            aparecer dentro da ficha de{" "}
            <span className="font-semibold">{escolhido.nome}</span> ·{" "}
            {escolhido.telefone}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <ConfirmSubmitButton
              className={botaoDiscreto}
              confirmMessage={`Juntar "${cliente.nome}" a "${escolhido.nome}"? Esta ficha deixa de aparecer sozinha. Pode ser desfeito.`}
              pendingLabel="A juntar..."
            >
              Juntar
            </ConfirmSubmitButton>
            <button
              className={botaoDiscreto}
              onClick={() => setEscolhido(null)}
              type="button"
            >
              Escolher outro
            </button>
            <Mensagem resultado={resultado} />
          </div>
        </form>
      ) : (
        <>
          {sugeridos.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-amber-900">
                {sugeridos.length === 1
                  ? "Há um contacto com este mesmo número. É quase de certeza a mesma pessoa."
                  : `Há ${sugeridos.length} contactos com este mesmo número.`}
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
            aria-label="Procurar o contacto principal"
            className={`${inputClass} w-full`}
            onChange={(evento) => setProcura(evento.target.value)}
            placeholder="Procurar por nome ou número..."
            type="search"
            value={procura}
          />

          {procura.trim() !== "" ? (
            encontrados.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Nenhum contacto corresponde a essa procura.
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

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input name="duplicado_id" type="hidden" value={duplicadoId} />
      <FormSubmitButton className={botaoDiscreto} pendingLabel="A separar...">
        Separar
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
}: {
  aberto: boolean;
  aoAlternar: () => void;
  cliente: ClienteLinha;
  marcada: boolean;
  moeda: string;
}) {
  const dias = diasDesde(cliente.mensagemUltima);

  return (
    <button
      aria-expanded={aberto}
      className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition hover:bg-zinc-50 sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] ${
        aberto ? "bg-zinc-50" : ""
      }`}
      onClick={aoAlternar}
      type="button"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-900">
            {cliente.nome}
          </span>
          {marcada ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              duplicado
            </span>
          ) : null}
          {cliente.juntos.length > 0 ? (
            <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
              +{cliente.juntos.length} junto
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-zinc-500 sm:hidden">
          {cliente.telefone} · {formatData(cliente.mensagemUltima)}
        </span>
      </span>

      <span className="hidden truncate text-xs text-zinc-600 sm:block">
        {cliente.telefone}
      </span>

      <span className="hidden text-xs text-zinc-600 sm:block">
        {dias === null ? "—" : `há ${dias} ${dias === 1 ? "dia" : "dias"}`}
      </span>

      <span className="hidden text-xs text-zinc-600 sm:block">
        {cliente.mensagens} msg
      </span>

      <span className="shrink-0 text-right text-sm font-semibold text-zinc-900">
        {cliente.totalGasto === null
          ? "—"
          : formatMoeda(cliente.totalGasto, moeda)}
      </span>
    </button>
  );
}

/** A ficha aberta, por baixo da linha. */
function FichaDoCliente({
  actionJuntar,
  actionNotas,
  actionSeparar,
  cliente,
  moeda,
  outros,
  podeEditar,
}: {
  actionJuntar: ClienteAction;
  actionNotas: ClienteAction;
  actionSeparar: ClienteAction;
  cliente: ClienteLinha;
  moeda: string;
  outros: ClienteLinha[];
  podeEditar: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-zinc-200 bg-zinc-50/60 px-4 py-4">
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
            Abrir no WhatsApp
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
          className="inline-flex min-h-9 items-center rounded-full bg-zinc-950 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          href={buildAppConversationHref(cliente.identificadorConversa, null)}
        >
          Ir para a conversa na plataforma
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Última mensagem</dt>
          <dd className="mt-0.5 text-sm font-semibold text-zinc-900">
            {formatData(cliente.mensagemUltima)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Mensagens</dt>
          <dd className="mt-0.5 text-sm font-semibold text-zinc-900">
            {cliente.mensagens}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Primeiro contacto</dt>
          <dd className="mt-0.5 text-sm font-semibold text-zinc-900">
            {formatData(cliente.primeiroContactoEm)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Marcações</dt>
          <dd className="mt-0.5 text-sm font-semibold text-zinc-900">
            {cliente.totalGasto === null ? "—" : cliente.historico.length}
          </dd>
        </div>
      </dl>

      {podeEditar ? (
        <NotasForm action={actionNotas} cliente={cliente} />
      ) : cliente.notas ? (
        <p className="text-sm whitespace-pre-line text-zinc-700">
          {cliente.notas}
        </p>
      ) : null}

      <div>
        <p className="text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
          Histórico
        </p>
        {cliente.totalGasto === null ? (
          <p className="mt-2 text-xs text-zinc-500">
            As marcações vivem na base de dados do cliente e ela não está ligada
            neste ambiente.
          </p>
        ) : cliente.historico.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">
            Nunca marcou nada. Falou com o agente mas não fechou — é exactamente
            quem vale a pena voltar a contactar.
          </p>
        ) : (
          <ul className="mt-2">
            {cliente.historico.map((linha) => (
              <li
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 py-1.5 last:border-b-0"
                key={linha.id}
              >
                <span className="text-xs text-zinc-500">
                  {formatData(linha.dataInicio)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-700">
                  {linha.servico ?? "serviço não registado"}
                  {linha.viatura ? ` · ${linha.viatura}` : ""}
                  {linha.estado === "cancelada" ? " · cancelada" : ""}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    linha.estado === "cancelada"
                      ? "text-zinc-400 line-through"
                      : "text-zinc-900"
                  }`}
                >
                  {linha.valor === null ? "—" : formatMoeda(linha.valor, moeda)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cliente.juntos.length > 0 ? (
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase">
            Contactos juntos a este
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {cliente.juntos.map((junto) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2 last:border-b-0 last:pb-0"
                key={junto.id}
              >
                <span className="text-xs text-zinc-700">
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
    </div>
  );
}

export function ClientesPanel({
  actionCriar,
  actionJuntar,
  actionNotas,
  actionSeparar,
  clientes,
  deFora,
  historicoLigado,
  moeda,
  podeEditar,
}: {
  actionCriar: ClienteAction;
  actionJuntar: ClienteAction;
  actionNotas: ClienteAction;
  actionSeparar: ClienteAction;
  clientes: ClienteLinha[];
  deFora: ClientesDeFora;
  historicoLigado: boolean;
  moeda: string;
  podeEditar: boolean;
}) {
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
    { contagem: clientes.length, id: "todos", rotulo: "Todos" },
    { contagem: duplicados.size, id: "duplicados", rotulo: "Duplicados" },
    {
      contagem: clientes.filter((cliente) => {
        const dias = diasDesde(cliente.mensagemUltima);

        return dias === null || dias >= diasParaParado;
      }).length,
      id: "parados",
      rotulo: `Sem falar há ${diasParaParado}+ dias`,
    },
    {
      contagem: clientes.filter((cliente) => !cliente.notas).length,
      id: "semNotas",
      rotulo: "Sem notas",
    },
  ];

  return (
    <>
      {podeEditar ? (
        <div className={cartao}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
              Novo cliente
            </p>
            <button
              className={botaoDiscreto}
              onClick={() => setACriar((anterior) => !anterior)}
              type="button"
            >
              {aCriar ? "Fechar" : "Criar cliente"}
            </button>
          </div>

          {aCriar ? (
            <>
              <p className="mt-3 text-xs text-zinc-500">
                Fica no WhatsApp. É o único canal onde o número é também o
                identificador da conversa, por isso o contacto liga-se à
                conversa real assim que a pessoa escrever.
              </p>
              <div className="mt-3">
                <CriarClienteForm action={actionCriar} />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {duplicados.size > 0 && filtro !== "duplicados" ? (
        <button
          className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-left text-xs text-amber-900 transition hover:bg-amber-100"
          onClick={() => mudarFiltro("duplicados")}
          type="button"
        >
          <span>
            <span className="font-semibold">{duplicados.size} contactos</span>{" "}
            partilham o número com outro. São a mesma pessoa duas vezes, porque
            a Meta entregou o número em dois formatos.
          </span>
          <span className="font-semibold underline">Ver só esses</span>
        </button>
      ) : null}

      <div className={cartao}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label
            className={`${labelClass} min-w-64 flex-1`}
            htmlFor="procurar-cliente"
          >
            Procurar por nome ou número
            <input
              className={`${inputClass} w-full`}
              id="procurar-cliente"
              onChange={(evento) => {
                setProcura(evento.target.value);
                setPagina(0);
              }}
              placeholder="ex.: Martim, ou 912345678"
              type="search"
              value={procura}
            />
          </label>
          <p className="text-xs text-zinc-500">
            {filtrados.length} de {clientes.length} clientes
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filtro === chip.id
                  ? "bg-zinc-950 text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
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
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          O histórico de marcações não está disponível: faltam as credenciais da
          base de dados deste cliente neste ambiente. Os nomes, números e notas
          aparecem; os valores não.
        </p>
      ) : null}

      {filtrados.length === 0 ? (
        <div className={cartao}>
          <p className="text-sm text-zinc-600">
            {clientes.length === 0
              ? "Ainda não há clientes com nome e número de telefone."
              : "Nenhum cliente corresponde a essa procura."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[22px] border border-zinc-200/80 bg-white shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-x-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] font-semibold tracking-[0.12em] text-zinc-500 uppercase sm:grid">
            <span>Nome</span>
            <span>Telefone</span>
            <span>Última mensagem</span>
            <span>Mensagens</span>
            <span className="text-right">Gasto</span>
          </div>

          <ul>
            {visiveis.map((cliente) => (
              <li className="border-b border-zinc-100 last:border-b-0" key={cliente.id}>
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
                />

                {aberto === cliente.id ? (
                  <FichaDoCliente
                    actionJuntar={actionJuntar}
                    actionNotas={actionNotas}
                    actionSeparar={actionSeparar}
                    cliente={cliente}
                    moeda={moeda}
                    outros={clientes.filter((outro) => outro.id !== cliente.id)}
                    podeEditar={podeEditar}
                  />
                ) : null}
              </li>
            ))}
          </ul>

          {paginas > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-2.5">
              <button
                className={botaoDiscreto}
                disabled={paginaActual === 0}
                onClick={() => setPagina(paginaActual - 1)}
                type="button"
              >
                Anterior
              </button>
              <span className="text-xs text-zinc-600">
                Página {paginaActual + 1} de {paginas}
              </span>
              <button
                className={botaoDiscreto}
                disabled={paginaActual >= paginas - 1}
                onClick={() => setPagina(paginaActual + 1)}
                type="button"
              >
                Seguinte
              </button>
            </div>
          ) : null}
        </div>
      )}

      {deFora.semTelefoneReal + deFora.semNome > 0 ? (
        <div className={cartao}>
          <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
            Contactos que não entram na lista
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-zinc-700">
            {deFora.semTelefoneReal > 0 ? (
              <li>
                <span className="font-semibold">{deFora.semTelefoneReal}</span>{" "}
                sem número de telefone utilizável. São quase todos de Instagram
                e Messenger: nesses canais a Meta não dá o telemóvel, dá um
                identificador interno. Quem marcou por lá deu o número ao
                agente, e esse número está na marcação — não no contacto.
              </li>
            ) : null}
            {deFora.semNome > 0 ? (
              <li>
                <span className="font-semibold">{deFora.semNome}</span> com
                número mas sem nome: a conversa não chegou ao ponto de o agente
                perguntar como a pessoa se chama.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </>
  );
}
