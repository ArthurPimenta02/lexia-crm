"use client";

import { useActionState, useMemo, useState } from "react";

import { ChannelBadge } from "@/app/components/channel-brand";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { FormSubmitButton } from "@/app/components/form-submit-button";
import type { ClienteLinha, ClientesDeFora } from "@/lib/clientes/read";
import type { GravarClienteResultado } from "@/lib/clientes/write";

/**
 * A ficha de clientes.
 *
 * Decisões de ecrã que valem a pena explicar:
 *
 * - A lista está ordenada pela última mensagem, não por nome. O dono não vem
 *   aqui procurar uma letra; vem ver quem falou com ele.
 * - "Enviar mensagem" abre o `wa.me` em vez de enviar. A plataforma não tem
 *   envio de WhatsApp e, nos canais da Meta, uma mensagem fora da janela de
 *   24 h seria recusada — abrir a conversa é o que funciona sempre.
 * - Quem não tem telefone utilizável não desaparece em silêncio: o número
 *   aparece em baixo, com a explicação. Um ecrã que mostra 341 de 999 sem
 *   dizer nada parece estar com um defeito.
 */

export type ClienteAction = (
  estado: GravarClienteResultado | null,
  formData: FormData,
) => Promise<GravarClienteResultado>;

const inputClass =
  "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950 disabled:bg-zinc-50 disabled:text-zinc-500";

const labelClass =
  "flex flex-col gap-1.5 text-xs font-semibold tracking-[0.12em] text-zinc-500 uppercase";

const botaoPrimario =
  "inline-flex min-h-10 items-center rounded-full bg-zinc-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60";

const botaoDiscreto =
  "inline-flex min-h-8 items-center rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-60";

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
      <div className="flex flex-wrap items-end gap-3">
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

        <label
          className={`${labelClass} min-w-48 flex-1`}
          htmlFor="cliente-telefone"
        >
          Telefone com indicativo
          <input
            className={`${inputClass} w-full`}
            id="cliente-telefone"
            inputMode="tel"
            maxLength={32}
            name="telefone"
            placeholder="351912345678"
            required
            type="tel"
          />
        </label>

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

        <FormSubmitButton className={botaoPrimario} pendingLabel="A criar...">
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

/**
 * Juntar este contacto a outro.
 *
 * O selector lista os outros clientes para o dono escolher o principal. Quem
 * é escolhido fica com a ficha; este passa a aparecer por baixo dele. Nada é
 * apagado, e por isso separar é possível a qualquer momento.
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

  if (outros.length === 0) {
    return null;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input name="duplicado_id" type="hidden" value={cliente.id} />

      <label className={labelClass} htmlFor={`juntar-${cliente.id}`}>
        Juntar a outro contacto
        <select
          className={`${inputClass} w-full`}
          defaultValue=""
          id={`juntar-${cliente.id}`}
          name="principal_id"
          required
        >
          <option disabled value="">
            Escolhe o contacto principal
          </option>
          {outros.map((outro) => (
            <option key={outro.id} value={outro.id}>
              {outro.nome} · {outro.telefone}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3">
        <ConfirmSubmitButton
          className={botaoDiscreto}
          confirmMessage={`Juntar "${cliente.nome}" ao contacto escolhido? Esta ficha deixa de aparecer sozinha e passa a aparecer dentro da do principal. Pode ser desfeito.`}
          pendingLabel="A juntar..."
        >
          Juntar
        </ConfirmSubmitButton>
        <Mensagem resultado={resultado} />
      </div>
    </form>
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

function FichaDoCliente({
  actionJuntar,
  actionNotas,
  actionSeparar,
  aberto,
  aoAlternar,
  cliente,
  moeda,
  outros,
  podeEditar,
}: {
  actionJuntar: ClienteAction;
  actionNotas: ClienteAction;
  actionSeparar: ClienteAction;
  aberto: boolean;
  aoAlternar: () => void;
  cliente: ClienteLinha;
  moeda: string;
  outros: ClienteLinha[];
  podeEditar: boolean;
}) {
  const dias = diasDesde(cliente.mensagemUltima);

  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-zinc-950">
            {cliente.nome}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">{cliente.telefone}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {cliente.canais.map((canal) => (
              <ChannelBadge channel={canal} key={canal} />
            ))}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold tracking-tight text-zinc-950">
            {cliente.totalGasto === null
              ? "—"
              : formatMoeda(cliente.totalGasto, moeda)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {cliente.totalGasto === null
              ? "histórico não disponível"
              : `${cliente.historico.length} ${
                  cliente.historico.length === 1 ? "marcação" : "marcações"
                }`}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-zinc-500">Última mensagem</dt>
          <dd className="mt-0.5 text-sm font-semibold text-zinc-900">
            {formatData(cliente.mensagemUltima)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Sem falar há</dt>
          <dd className="mt-0.5 text-sm font-semibold text-zinc-900">
            {dias === null ? "—" : `${dias} ${dias === 1 ? "dia" : "dias"}`}
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
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          className="inline-flex min-h-9 items-center rounded-full bg-[#25D366] px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-95"
          href={`https://wa.me/${cliente.telefoneDigitos}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          Abrir no WhatsApp
        </a>
        <button className={botaoDiscreto} onClick={aoAlternar} type="button">
          {aberto ? "Fechar ficha" : "Ver ficha"}
        </button>
      </div>

      {aberto ? (
        <div className="mt-4 flex flex-col gap-4 border-t border-zinc-200 pt-4">
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
                As marcações vivem na base de dados do cliente e ela não está
                ligada neste ambiente.
              </p>
            ) : cliente.historico.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">
                Nunca marcou nada. Falou com o agente mas não fechou — é
                exactamente quem vale a pena voltar a contactar.
              </p>
            ) : (
              <ul className="mt-2">
                {cliente.historico.map((linha) => (
                  <li
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 py-1.5 last:border-b-0"
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
                      {linha.valor === null
                        ? "—"
                        : formatMoeda(linha.valor, moeda)}
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
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2 last:border-b-0 last:pb-0"
                    key={junto.id}
                  >
                    <span className="text-xs text-zinc-700">
                      {junto.canal} · {junto.telefone || junto.identificadorConversa}
                    </span>
                    {podeEditar ? (
                      <SepararForm
                        action={actionSeparar}
                        duplicadoId={junto.id}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {podeEditar ? (
            <JuntarForm
              action={actionJuntar}
              cliente={cliente}
              outros={outros}
            />
          ) : null}
        </div>
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
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const filtrados = useMemo(() => {
    const alvo = procura.trim().toLowerCase();

    if (alvo === "") {
      return clientes;
    }

    const digitos = alvo.replace(/\D/g, "");

    return clientes.filter(
      (cliente) =>
        cliente.nome.toLowerCase().includes(alvo) ||
        (digitos !== "" && cliente.telefoneDigitos.includes(digitos)),
    );
  }, [clientes, procura]);

  return (
    <>
      {podeEditar ? (
        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <p className="text-xs font-semibold tracking-[0.22em] text-zinc-500 uppercase">
            Novo cliente
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Fica no WhatsApp. É o único canal onde o número é também o
            identificador da conversa, por isso o contacto liga-se à conversa
            real assim que a pessoa escrever.
          </p>
          <div className="mt-3">
            <CriarClienteForm action={actionCriar} />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label
          className={`${labelClass} min-w-64 flex-1`}
          htmlFor="procurar-cliente"
        >
          Procurar por nome ou número
          <input
            className={`${inputClass} w-full`}
            id="procurar-cliente"
            onChange={(evento) => setProcura(evento.target.value)}
            placeholder="ex.: Martim, ou 912345678"
            type="search"
            value={procura}
          />
        </label>
        <p className="text-xs text-zinc-500">
          {filtrados.length} de {clientes.length}
        </p>
      </div>

      {!historicoLigado ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          O histórico de marcações não está disponível: faltam as credenciais
          da base de dados deste cliente neste ambiente. Os nomes, números e
          notas aparecem; os valores não.
        </p>
      ) : null}

      {filtrados.length === 0 ? (
        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
          <p className="text-sm text-zinc-600">
            {clientes.length === 0
              ? "Ainda não há clientes com nome e número de telefone."
              : "Nenhum cliente corresponde a essa procura."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtrados.map((cliente) => (
            <FichaDoCliente
              actionJuntar={actionJuntar}
              actionNotas={actionNotas}
              actionSeparar={actionSeparar}
              aberto={abertos[cliente.id] ?? false}
              aoAlternar={() =>
                setAbertos((anterior) => ({
                  ...anterior,
                  [cliente.id]: !anterior[cliente.id],
                }))
              }
              cliente={cliente}
              key={cliente.id}
              moeda={moeda}
              outros={clientes.filter((outro) => outro.id !== cliente.id)}
              podeEditar={podeEditar}
            />
          ))}
        </div>
      )}

      {deFora.semTelefoneReal + deFora.semNome > 0 ? (
        <div className="rounded-[22px] border border-zinc-200/80 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.06)]">
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
