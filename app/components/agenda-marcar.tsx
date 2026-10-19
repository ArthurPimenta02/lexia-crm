"use client";

import { Check, Search, X } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { FormSubmitButton } from "@/app/components/form-submit-button";
import type { MarcarResultado } from "@/app/app/agenda/actions";
import type { ContactoParaEscolha } from "@/lib/clientes/read";
import type { ServicoAgendavel } from "@/lib/servicos/read";

/**
 * Marcar um atendimento a partir do painel do dia.
 *
 * O cliente escolhe-se de uma lista que já está no navegador
 * ------------------------------------------------------------
 * Não há pesquisa no servidor e isso é uma decisão, não uma falta. Medido a
 * 2026-10-19, o `getContactosParaEscolha` devolve 352 clientes no Detail e 98
 * na Miranda — 35 KB e 9 KB, que vêm juntos com a página. Filtrar isso no
 * navegador responde a cada letra sem espera; uma chamada ao servidor por
 * letra obrigava a atrasar a resposta de propósito para não a fazer 20 vezes,
 * e o resultado era pior em tudo.
 *
 * Procura-se pelo nome **ou** pelo número, porque é assim que o dono se lembra
 * de quem é. Os acentos são ignorados: quem escreve "jose" tem de encontrar o
 * "José", senão a caixa parece avariada.
 *
 * O formulário manda o identificador do cliente e nada mais sobre ele
 * -------------------------------------------------------------------
 * O nome, o telefone e a viatura são lidos no servidor a partir da ficha, pela
 * mesma razão que já era assim ao registar um serviço na ficha de clientes: o
 * navegador pode mudar o que quiser num campo escondido, e uma marcação com o
 * nome de uma pessoa e o número de outra nunca aparece no histórico de
 * nenhuma das duas.
 *
 * Escolher o serviço preenche o resto, mas não o tranca
 * -----------------------------------------------------
 * O preço, a duração e o nome do evento aparecem preenchidos a partir do
 * catálogo — e continuam a dar-se para mudar. O catálogo diz que a Lavagem
 * Detalhada leva 225 minutos ao Martim; se naquele carro vai levar mais, quem
 * marca é que sabe. O que não se deixa mudar é quem faz o serviço: as opções
 * são só os executores que a tabela diz que o fazem.
 *
 * Dois avisos e não um
 * --------------------
 * "É domingo" e "o Martim já tem trabalho a esta hora" são confirmações
 * separadas, com botões separados. Com um botão só, confirmar o domingo
 * passava por cima do choque de horários sem ele o chegar a ver.
 */

const inputClass =
  "h-10 rounded-2xl border border-border-strong bg-surface px-3 text-sm outline-none transition focus:border-foreground disabled:bg-surface-muted disabled:text-muted-foreground";

const labelTexto = "text-xs font-semibold text-muted-foreground";

const labelClass = `flex flex-col gap-1.5 ${labelTexto}`;

const botaoPrimario =
  "inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60";

const botaoDiscreto =
  "inline-flex min-h-8 items-center rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-surface-muted disabled:opacity-60";

/** Quantas sugestões aparecem de cada vez. */
const SUGESTOES = 8;

export type MarcarAction = (
  estado: MarcarResultado | null,
  formData: FormData,
) => Promise<MarcarResultado>;

/**
 * O texto como se procura: sem acentos, sem maiúsculas, sem espaços a mais.
 *
 * `normalize("NFD")` separa a letra do acento e o `replace` atira o acento
 * fora — é a forma de o fazer sem tabela de equivalências à mão.
 */
function paraProcura(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const soDigitos = (texto: string) => texto.replace(/\D/g, "");

/**
 * A caixa onde se escolhe o cliente.
 *
 * É um `combobox` e não um `<select>`: 352 opções num `<select>` obrigam a
 * rolar uma lista enorme, e o dono sabe o nome — só não sabe em que posição da
 * lista ele está.
 */
function EscolhaDoCliente({
  contactos,
  escolhido,
  escolher,
}: {
  contactos: ContactoParaEscolha[];
  escolhido: ContactoParaEscolha | null;
  escolher: (contacto: ContactoParaEscolha | null) => void;
}) {
  const [procura, setProcura] = useState("");
  const [aberto, setAberto] = useState(false);
  const [realcado, setRealcado] = useState(0);

  const sugestoes = useMemo(() => {
    const texto = paraProcura(procura);

    if (texto === "") {
      return [];
    }

    const digitos = soDigitos(procura);

    return contactos
      .filter(
        (contacto) =>
          paraProcura(contacto.nome).includes(texto) ||
          (digitos.length >= 3 && contacto.telefoneDigitos.includes(digitos)),
      )
      .slice(0, SUGESTOES);
  }, [contactos, procura]);

  if (escolhido) {
    return (
      <div className="flex w-full flex-col gap-1.5">
        <span className={labelTexto}>Cliente</span>

        <div className="flex items-center gap-2 rounded-2xl border border-border-strong bg-surface-muted px-3 py-2">
          <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {escolhido.nome}
            </p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {escolhido.telefone}
            </p>
          </div>

          <button
            className={botaoDiscreto}
            onClick={() => {
              escolher(null);
              setProcura("");
            }}
            type="button"
          >
            Trocar
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          A marcação fica no nome e no número desta ficha, por isso aparece no
          histórico dela.
        </p>
      </div>
    );
  }

  const escolherSugestao = (contacto: ContactoParaEscolha) => {
    escolher(contacto);
    setAberto(false);
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label className={labelTexto} htmlFor="marcar-cliente">
        Cliente
      </label>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-muted-foreground"
        />

        <input
          aria-activedescendant={
            aberto && sugestoes[realcado]
              ? `marcar-cliente-${sugestoes[realcado].id}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls="marcar-cliente-lista"
          aria-expanded={aberto && sugestoes.length > 0}
          autoComplete="off"
          className={`${inputClass} w-full pl-9`}
          id="marcar-cliente"
          onChange={(evento) => {
            setProcura(evento.target.value);
            setAberto(true);
            setRealcado(0);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={(evento) => {
            if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
              // Sem isto, a seta leva o cursor para o início do texto ao mesmo
              // tempo que muda a sugestão realçada.
              evento.preventDefault();
              setAberto(true);
              setRealcado((actual) => {
                const total = sugestoes.length;

                if (total === 0) {
                  return 0;
                }

                const passo = evento.key === "ArrowDown" ? 1 : total - 1;

                return (actual + passo) % total;
              });

              return;
            }

            if (evento.key === "Enter" && aberto && sugestoes[realcado]) {
              // O `Enter` numa sugestão escolhe-a; sem isto submetia o
              // formulário sem cliente nenhum.
              evento.preventDefault();
              escolherSugestao(sugestoes[realcado]);

              return;
            }

            if (evento.key === "Escape" && aberto) {
              // Fecha a lista sem fechar o painel do dia por trás.
              evento.stopPropagation();
              setAberto(false);
            }
          }}
          placeholder="Escreve o nome ou o número"
          role="combobox"
          type="text"
          value={procura}
        />

        {aberto && sugestoes.length > 0 ? (
          <ul
            className="absolute inset-x-0 top-11 z-10 max-h-56 overflow-y-auto rounded-2xl border border-border-strong bg-surface py-1 shadow-lg"
            id="marcar-cliente-lista"
            role="listbox"
          >
            {sugestoes.map((contacto, indice) => (
              <li
                aria-selected={indice === realcado}
                id={`marcar-cliente-${contacto.id}`}
                key={contacto.id}
                role="option"
              >
                <button
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition ${
                    indice === realcado ? "bg-muted" : "hover:bg-muted/60"
                  }`}
                  // `onMouseDown` e não `onClick`: o `blur` do campo fecha a
                  // lista, e com `onClick` a lista já não existia quando o
                  // clique chegava.
                  onMouseDown={(evento) => {
                    evento.preventDefault();
                    escolherSugestao(contacto);
                  }}
                  type="button"
                >
                  <span className="text-sm font-semibold text-foreground">
                    {contacto.nome}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {contacto.telefone}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {procura.trim() === ""
          ? `${contactos.length} clientes na base. Começa a escrever e as opções aparecem.`
          : sugestoes.length === 0
            ? "Nenhum cliente com esse nome ou número. Cria-o primeiro na aba Clientes."
            : "Carrega no cliente certo para a marcação ficar no nome dele."}
      </p>
    </div>
  );
}

/** A hora de um conflito, só as horas e os minutos. */
function horaDoConflito(iso: string | null, timeZone: string) {
  if (!iso) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function NovaMarcacaoForm({
  action,
  contactos,
  dia,
  fechar,
  moeda,
  servicos,
  timeZone,
}: {
  action: MarcarAction;
  contactos: ContactoParaEscolha[];
  /** O dia que o painel tem aberto, como `AAAA-MM-DD`. */
  dia: string;
  fechar: () => void;
  moeda: string | null;
  servicos: ServicoAgendavel[];
  timeZone: string;
}) {
  const [resultado, formAction] = useActionState<
    MarcarResultado | null,
    FormData
  >(action, null);

  const [escolhido, setEscolhido] = useState<ContactoParaEscolha | null>(null);
  const [servicoId, setServicoId] = useState("");
  const [executor, setExecutor] = useState("");
  const [duracao, setDuracao] = useState("");
  const [valor, setValor] = useState("");
  const [titulo, setTitulo] = useState("");
  // Depois de o dono escrever o nome do evento à mão, trocar de serviço não lhe
  // apaga o que escreveu.
  const [tituloMeu, setTituloMeu] = useState(false);

  const servico = servicos.find((linha) => linha.id === servicoId) ?? null;

  const sugerirTitulo = (
    nomeDoServico: string | null,
    contacto: ContactoParaEscolha | null,
  ) => {
    if (tituloMeu) {
      return;
    }

    setTitulo(
      [nomeDoServico, contacto?.nome].filter(Boolean).join(" — ").trim(),
    );
  };

  const escolherServico = (id: string) => {
    setServicoId(id);

    const novo = servicos.find((linha) => linha.id === id) ?? null;
    const primeiro = novo?.executores[0] ?? null;

    setExecutor(primeiro?.chave ?? "");
    setDuracao(primeiro ? String(primeiro.duracaoMinutos) : "");
    setValor(novo?.precoBase == null ? "" : String(novo.precoBase));
    sugerirTitulo(novo?.nome ?? null, escolhido);
  };

  const escolherExecutor = (chave: string) => {
    setExecutor(chave);

    const linha = servico?.executores.find((um) => um.chave === chave) ?? null;

    if (linha) {
      setDuracao(String(linha.duracaoMinutos));
    }
  };

  const escolherContacto = (contacto: ContactoParaEscolha | null) => {
    setEscolhido(contacto);
    sugerirTitulo(servico?.nome ?? null, contacto);
  };

  const avisos = resultado?.avisos ?? [];
  const conflitos = resultado?.conflitos ?? [];

  if (resultado?.ok) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
        <p className="text-sm font-semibold text-emerald-900">
          {resultado.mensagem}
        </p>
        <p className="text-xs text-emerald-900/80">
          Já está na agenda do Google e aparece aqui assim que a página
          recarregar.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {resultado.linkGoogle ? (
            <a
              className="text-xs font-semibold text-emerald-900 underline underline-offset-4"
              href={resultado.linkGoogle}
              rel="noreferrer"
              target="_blank"
            >
              Abrir no Google
            </a>
          ) : null}

          <button className={botaoDiscreto} onClick={fechar} type="button">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-border-strong bg-surface-muted/60 px-3 py-3"
    >
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Marcar atendimento
        </p>

        <button
          aria-label="Cancelar"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={fechar}
          type="button"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      <EscolhaDoCliente
        contactos={contactos}
        escolher={escolherContacto}
        escolhido={escolhido}
      />

      <input name="contacto_id" type="hidden" value={escolhido?.id ?? ""} />

      <label className={labelClass} htmlFor="marcar-servico">
        Serviço
        <select
          className={`${inputClass} w-full`}
          id="marcar-servico"
          name="servico_id"
          onChange={(evento) => escolherServico(evento.target.value)}
          required
          value={servicoId}
        >
          <option value="">Escolhe o serviço</option>
          {servicos.map((linha) => (
            <option key={linha.id} value={linha.id}>
              {linha.nome}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass} htmlFor="marcar-titulo">
        Nome do evento
        <input
          className={`${inputClass} w-full`}
          id="marcar-titulo"
          maxLength={500}
          name="titulo"
          onChange={(evento) => {
            setTitulo(evento.target.value);
            setTituloMeu(true);
          }}
          placeholder="ex.: Lavagem Detalhada — Martim Cordeiro"
          required
          type="text"
          value={titulo}
        />
      </label>

      <div className="flex flex-wrap items-start gap-3">
        <label className={`${labelClass} w-36`} htmlFor="marcar-data">
          Dia
          <input
            className={`${inputClass} w-full`}
            defaultValue={dia}
            id="marcar-data"
            name="data"
            required
            type="date"
          />
        </label>

        <label className={`${labelClass} w-28`} htmlFor="marcar-hora">
          Hora
          <input
            className={`${inputClass} w-full`}
            id="marcar-hora"
            name="hora"
            required
            step={900}
            type="time"
          />
        </label>

        {/*
          O executor é um `<select>` com as opções do serviço escolhido e não a
          lista toda: o catálogo diz quem faz o quê, e o Roberto não faz
          restauro de faróis.
        */}
        <label className={`${labelClass} w-36`} htmlFor="marcar-executor">
          Quem faz
          <select
            className={`${inputClass} w-full`}
            disabled={!servico}
            id="marcar-executor"
            name="executor"
            onChange={(evento) => escolherExecutor(evento.target.value)}
            required
            value={executor}
          >
            {servico ? null : <option value="">—</option>}
            {(servico?.executores ?? []).map((linha) => (
              <option key={linha.chave} value={linha.chave}>
                {linha.nome}
              </option>
            ))}
          </select>
        </label>

        <label className={`${labelClass} w-32`} htmlFor="marcar-duracao">
          Duração (min)
          <input
            className={`${inputClass} w-full`}
            id="marcar-duracao"
            inputMode="numeric"
            min={1}
            name="duracao"
            onChange={(evento) => setDuracao(evento.target.value)}
            step={15}
            type="number"
            value={duracao}
          />
        </label>

        <label className={`${labelClass} w-32`} htmlFor="marcar-valor">
          Valor {moeda ? `(${moeda})` : ""}
          <input
            className={`${inputClass} w-full`}
            id="marcar-valor"
            inputMode="decimal"
            min={0}
            name="valor"
            onChange={(evento) => setValor(evento.target.value)}
            placeholder="opcional"
            step="0.01"
            type="number"
            value={valor}
          />
        </label>

        <label
          className={`${labelClass} min-w-40 flex-1`}
          htmlFor="marcar-viatura"
        >
          Viatura
          <input
            className={`${inputClass} w-full`}
            id="marcar-viatura"
            maxLength={160}
            name="viatura"
            placeholder="opcional"
            type="text"
          />
        </label>
      </div>

      <label className={labelClass} htmlFor="marcar-observacoes">
        Observações
        <input
          className={`${inputClass} w-full`}
          id="marcar-observacoes"
          maxLength={4000}
          name="observacoes"
          placeholder="opcional"
          type="text"
        />
      </label>

      {resultado &&
      !resultado.ok &&
      avisos.length === 0 &&
      conflitos.length === 0 ? (
        <p className="text-xs text-red-700" role="status">
          {resultado.mensagem}
        </p>
      ) : null}

      {/*
        Nada foi escrito na agenda nesta passagem — os avisos existem para
        serem lidos antes e não depois. O `confirmado` só acompanha o botão
        que insiste.
      */}
      {avisos.length > 0 ? (
        <div className="rounded-xl bg-amber-50 px-3 py-3 text-xs text-amber-900">
          <p className="font-semibold">{resultado?.mensagem}</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
            {avisos.map((aviso) => (
              <li key={aviso}>{aviso}</li>
            ))}
          </ul>
          <div className="mt-3">
            <input name="confirmado" type="hidden" value="sim" />
            <FormSubmitButton
              className={botaoPrimario}
              pendingLabel="A marcar..."
            >
              Marcar mesmo assim
            </FormSubmitButton>
          </div>
        </div>
      ) : null}

      {/*
        O choque de horários tem o seu próprio botão de propósito. Se fosse o
        mesmo campo do `confirmado`, quem confirmasse "é domingo" marcava por
        cima de outro trabalho sem o ver.
      */}
      {conflitos.length > 0 ? (
        <div className="rounded-xl bg-red-50 px-3 py-3 text-xs text-red-900">
          <p className="font-semibold">{resultado?.mensagem}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {conflitos.map((conflito, indice) => (
              <li key={`${conflito.inicio ?? indice}`}>
                {horaDoConflito(conflito.inicio, timeZone)}–
                {horaDoConflito(conflito.fim, timeZone)} ·{" "}
                {conflito.titulo || "sem título"}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Marcar por cima deixa as duas coisas à mesma hora. Se for de
            propósito, insiste; se não, muda a hora.
          </p>
          <div className="mt-3">
            <input name="confirmado" type="hidden" value="sim" />
            <input name="ignorar_conflito" type="hidden" value="sim" />
            <FormSubmitButton
              className={botaoPrimario}
              pendingLabel="A marcar..."
            >
              Marcar à mesma hora
            </FormSubmitButton>
          </div>
        </div>
      ) : null}

      {avisos.length === 0 && conflitos.length === 0 ? (
        <FormSubmitButton
          className={botaoPrimario}
          disabled={!escolhido}
          pendingLabel="A marcar..."
        >
          Marcar
        </FormSubmitButton>
      ) : null}
    </form>
  );
}
