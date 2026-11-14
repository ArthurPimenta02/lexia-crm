import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";

import { BotaoFiltros } from "@/app/components/botao-filtros";

import { ChannelIcon } from "@/app/components/channel-brand";
import {
  appendConversationPeriodParams,
  ConversationCustomPeriodForm,
  type ConversationPeriodState,
} from "@/app/components/conversation-period-filter";
import { timezoneOptions } from "@/lib/clientes/timezone";
import {
  conversationPeriodOptions,
  type ConversationPeriod,
} from "@/lib/conversations/date-range";
import { getT } from "@/lib/i18n/servidor";

/**
 * Os filtros da tela de Conversas (redesenho de 06/11/2026).
 *
 * Tudo fica no endereço: canal, período, fuso, busca, situação e a conversa
 * aberta. `hrefConversas` monta o endereço a partir do estado atual e troca
 * só o que se pede, para nenhum filtro apagar os outros.
 */
export type SituacaoFiltro = "" | "esperando";
/** Temperatura do lead (14/11): frio, morno ou quente, decidida pelo Juiz de follow-up. */
export type TemperaturaFiltro = "" | "frio" | "morno" | "quente";

export type EstadoConversas = {
  basePath: string;
  busca: string;
  canal: string;
  cliente?: string;
  conversa?: string | null;
  fuso: string;
  periodo: ConversationPeriodState;
  situacao: SituacaoFiltro;
  temperatura?: TemperaturaFiltro;
};

export function hrefConversas(
  estado: EstadoConversas,
  mudar: Partial<Omit<EstadoConversas, "basePath">> = {},
) {
  const e = { ...estado, ...mudar };
  const params = new URLSearchParams();

  if (e.cliente) params.set("cliente", e.cliente);
  if (e.canal) params.set("canal", e.canal);
  if (e.busca) params.set("busca", e.busca);
  if (e.situacao) params.set("situacao", e.situacao);
  if (e.temperatura) params.set("temperatura", e.temperatura);
  params.set("fuso", e.fuso);
  appendConversationPeriodParams(params, e.periodo);
  if (e.conversa) params.set("conversa", e.conversa);

  return `${e.basePath}?${params.toString()}`;
}

/** Os campos escondidos que os formulários levam para não perder filtros. */
function CamposEscondidos({ estado }: { estado: EstadoConversas }) {
  return (
    <>
      {estado.cliente ? <input name="cliente" type="hidden" value={estado.cliente} /> : null}
      {estado.canal ? <input name="canal" type="hidden" value={estado.canal} /> : null}
      {estado.situacao ? <input name="situacao" type="hidden" value={estado.situacao} /> : null}
      {estado.temperatura ? <input name="temperatura" type="hidden" value={estado.temperatura} /> : null}
      <input name="fuso" type="hidden" value={estado.fuso} />
      <input name="periodo" type="hidden" value={estado.periodo.key} />
      {estado.periodo.key === "personalizado" ? (
        <>
          <input name="inicio" type="hidden" value={estado.periodo.start} />
          <input name="fim" type="hidden" value={estado.periodo.end} />
        </>
      ) : null}
    </>
  );
}

const canais = ["", "whatsapp", "instagram", "messenger"] as const;
const nomesCanal: Record<string, string> = {
  instagram: "Instagram",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
};

/** A busca por nome ou telefone, no topo da lista. Procura em todo o período. */
export async function BuscaConversas({ estado }: { estado: EstadoConversas }) {
  const t = await getT();

  return (
    <Form action={estado.basePath} className="relative min-w-0" replace scroll={false}>
      <CamposEscondidos estado={estado} />
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
      />
      <input
        aria-label={t("Pesquisar conversa por nome ou telefone")}
        autoComplete="off"
        className="ds-campo h-9 w-full pr-9 pl-9"
        defaultValue={estado.busca}
        inputMode="search"
        maxLength={80}
        name="busca"
        placeholder={t("Buscar por nome ou número")}
        type="text"
      />
      {estado.busca ? (
        <Link
          aria-label={t("Limpar pesquisa")}
          className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground/70 transition hover:bg-muted hover:text-foreground"
          href={hrefConversas(estado, { busca: "", conversa: null })}
          title={t("Limpar pesquisa")}
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </Form>
  );
}

/*
 * Desenho A+ (14/11/2026): os filtros saem do topo da tela e passam para um
 * botão ao lado da busca. O painel abre por baixo, dentro da coluna da lista
 * (não por cima: a coluna corta o que transborda), e cada opção continua a ser
 * um link, para o filtro ficar no endereço.
 */

/** O período que vale sem ninguém escolher (o mesmo das duas páginas). */
export const PERIODO_PADRAO = "hoje";

export type OpcaoTemperatura = { chave: Exclude<TemperaturaFiltro, "">; label: string };

/** Quantos filtros estão ligados (o fuso não conta: só muda as horas). */
export function filtrosLigados(estado: EstadoConversas) {
  return (
    (estado.canal ? 1 : 0) +
    (estado.temperatura ? 1 : 0) +
    (estado.periodo.key !== PERIODO_PADRAO ? 1 : 0)
  );
}

function Opcoes({
  opcoes,
  rotulo,
}: {
  opcoes: { ativo: boolean; href: string; label: ReactNode }[];
  rotulo: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <nav aria-label={rotulo} className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => (
          <Link
            aria-current={o.ativo ? "true" : undefined}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] whitespace-nowrap transition-colors ${
              o.ativo
                ? "bg-primary font-semibold text-primary-foreground"
                : "bg-muted text-foreground hover:bg-border"
            }`}
            href={o.href}
            key={o.href}
            replace
            scroll={false}
          >
            {o.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/**
 * A busca e, ao lado, o botão Filtros. O painel abre por baixo com
 * temperatura (se o cliente tiver), canal, período e fuso horário.
 */
export async function BuscaEFiltros({
  estado,
  temperaturas,
}: {
  estado: EstadoConversas;
  temperaturas?: OpcaoTemperatura[] | null;
}) {
  const t = await getT();
  const ligados = filtrosLigados(estado);
  const limpar = hrefConversas(estado, {
    canal: "",
    conversa: null,
    periodo: { ...estado.periodo, key: PERIODO_PADRAO as ConversationPeriod },
    temperatura: "",
  });

  const painel = (
      <div className="flex flex-col gap-4 rounded-2xl bg-surface-muted p-4">
        {temperaturas && temperaturas.length > 0 ? (
          <Opcoes
            opcoes={[
              { ativo: !estado.temperatura, href: hrefConversas(estado, { temperatura: "", conversa: null }), label: t("Todas") },
              ...temperaturas.map((tp) => ({
                ativo: estado.temperatura === tp.chave,
                href: hrefConversas(estado, { temperatura: tp.chave, conversa: null }),
                label: tp.label,
              })),
            ]}
            rotulo={t("Temperatura")}
          />
        ) : null}
        <Opcoes
          opcoes={canais.map((canal) => ({
            ativo: estado.canal === canal,
            href: hrefConversas(estado, { canal, conversa: null }),
            label: canal ? (
              <>
                <ChannelIcon channel={canal} size="sm" />
                {nomesCanal[canal]}
              </>
            ) : (
              t("Todos")
            ),
          }))}
          rotulo={t("Canal")}
        />
        <Opcoes
          opcoes={conversationPeriodOptions.map((opcao) => ({
            ativo: estado.periodo.key === opcao.key,
            href: hrefConversas(estado, {
              periodo: { ...estado.periodo, key: opcao.key as ConversationPeriod },
            }),
            label: t(opcao.label),
          }))}
          rotulo={t("Período")}
        />
        {estado.periodo.key === "personalizado" ? <ConversationCustomPeriodForm estado={estado} /> : null}
        <Opcoes
          opcoes={timezoneOptions.map((fuso) => ({
            ativo: fuso.value === estado.fuso,
            href: hrefConversas(estado, { fuso: fuso.value }),
            label: t(fuso.label),
          }))}
          rotulo={t("Fuso horário")}
        />
        {ligados > 0 ? (
          <Link className="self-start text-[0.8125rem] font-medium text-foreground underline underline-offset-4" href={limpar} replace scroll={false}>
            {t("Limpar filtros")}
          </Link>
        ) : null}
      </div>
  );

  return (
    <BotaoFiltros
      busca={<BuscaConversas estado={estado} />}
      ligados={ligados}
      painel={painel}
      rotulo={
        ligados === 0
          ? t("Filtros")
          : ligados === 1
            ? t("Filtros, 1 ligado")
            : t("Filtros, {n} ligados", { n: ligados })
      }
      titulo={t("Filtros")}
    />
  );
}

/**
 * Por baixo da busca: o período e o fuso em letra pequena (para nunca se
 * esquecer que a lista é só de hoje) e uma etiqueta por filtro ligado, que
 * sai com um toque.
 */
export async function FiltrosAtivos({
  estado,
  nomePeriodo,
  nomeFuso,
  temperaturas,
}: {
  estado: EstadoConversas;
  nomePeriodo: string;
  nomeFuso: string;
  temperaturas?: OpcaoTemperatura[] | null;
}) {
  const t = await getT();
  const etiquetas = [
    estado.periodo.key !== PERIODO_PADRAO
      ? {
          label: nomePeriodo,
          href: hrefConversas(estado, {
            conversa: null,
            periodo: { ...estado.periodo, key: PERIODO_PADRAO as ConversationPeriod },
          }),
        }
      : null,
    estado.canal ? { label: nomesCanal[estado.canal] ?? estado.canal, href: hrefConversas(estado, { canal: "", conversa: null }) } : null,
    estado.temperatura
      ? {
          label: temperaturas?.find((tp) => tp.chave === estado.temperatura)?.label ?? estado.temperatura,
          href: hrefConversas(estado, { temperatura: "", conversa: null }),
        }
      : null,
  ].filter((e): e is { label: string; href: string } => Boolean(e));

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {etiquetas.map((e) => (
        <span className="inline-flex h-7 items-center gap-0.5 rounded-full bg-muted pr-1 pl-3 text-xs font-medium text-foreground" key={e.href}>
          {e.label}
          <Link
            aria-label={t("Tirar o filtro {nome}", { nome: e.label })}
            className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-border hover:text-foreground"
            href={e.href}
            replace
            scroll={false}
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </Link>
        </span>
      ))}
      <span className="text-xs text-muted-foreground">
        {etiquetas.length === 0 ? `${nomePeriodo} · ` : ""}
        {nomeFuso}
      </span>
    </div>
  );
}
