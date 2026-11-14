import Form from "next/form";
import Link from "next/link";
import { Globe, Search, X } from "lucide-react";

import { ChannelIcon } from "@/app/components/channel-brand";
import {
  appendConversationPeriodParams,
  ConversationCustomPeriodForm,
  type ConversationPeriodState,
} from "@/app/components/conversation-period-filter";
import { FiltroTrilho } from "@/app/components/tela";
import { getSelectedTimezone, timezoneOptions } from "@/lib/clientes/timezone";
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

/**
 * Os filtros que ficam no topo da tela: canal, período e fuso, todos em
 * barra de opções. O período "Personalizada" abre as datas logo abaixo.
 */
export async function FiltrosConversas({ estado }: { estado: EstadoConversas }) {
  const t = await getT();
  const fusoAtual = getSelectedTimezone(estado.fuso);

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-2 lg:items-end">
      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
        <FiltroTrilho
          opcoes={canais.map((canal) => ({
            ativo: estado.canal === canal,
            href: hrefConversas(estado, { canal, conversa: null }),
            label: canal ? (
              <>
                <ChannelIcon channel={canal} size="sm" />
                <span className="max-sm:sr-only">{nomesCanal[canal]}</span>
              </>
            ) : (
              t("Todos")
            ),
          }))}
          rotulo={t("Canal")}
        />
        <details className="group relative">
          <summary
            aria-label={t("Fuso horário")}
            className="ds-botao ds-botao-secundario ds-botao-p cursor-pointer list-none [&::-webkit-details-marker]:hidden"
            title={t("Fuso horário")}
          >
            <Globe aria-hidden="true" className="h-3.5 w-3.5" />
            {t(fusoAtual.label)}
          </summary>
          <div className="ds-bloco absolute top-[calc(100%+0.375rem)] right-0 z-50 flex w-44 flex-col p-1.5 shadow-xl max-lg:left-0 max-lg:right-auto">
            <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-muted-foreground">
              {t("Fuso horário")}
            </p>
            {timezoneOptions.map((fuso) => (
              <Link
                aria-current={fuso.value === estado.fuso ? "true" : undefined}
                className="tela-linha py-2 text-sm text-foreground"
                href={hrefConversas(estado, { fuso: fuso.value })}
                key={fuso.value}
                scroll={false}
              >
                {t(fuso.label)}
              </Link>
            ))}
          </div>
        </details>
        <FiltroTrilho
          opcoes={conversationPeriodOptions.map((opcao) => ({
            ativo: estado.periodo.key === opcao.key,
            href: hrefConversas(estado, {
              periodo: { ...estado.periodo, key: opcao.key as ConversationPeriod },
            }),
            label: t(opcao.label),
          }))}
          rotulo={t("Período")}
        />
      </div>
      {estado.periodo.key === "personalizado" ? (
        <ConversationCustomPeriodForm estado={estado} />
      ) : null}
    </div>
  );
}

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
