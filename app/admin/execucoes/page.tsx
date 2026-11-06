import Link from "next/link";
import { redirect } from "next/navigation";

import { Activity, AlertTriangle, Check, Plus, UserRound } from "lucide-react";

import { TechnicalDetailsModal } from "@/app/admin/execucoes/technical-details-modal";
import { ListaExecucoes } from "@/app/app/execucoes/lista-execucoes";
import { CartaoMetrica } from "@/app/components/cartoes";
import {
  CabecalhoTela,
  FiltroTrilho,
  GradeMetricas,
  VazioTela,
} from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { createClient } from "@/lib/supabase/server";

type AdminExecutionsPageProps = {
  searchParams: Promise<{
    cliente?: string | string[];
    rota?: string | string[];
    estado?: string | string[];
  }>;
};

type AdminTestExecution = {
  id: string;
  cliente_slug: string;
  session_id: string | null;
  run_id: string | null;
  teste_id: string | null;
  criado_em: string | null;
  origem: string | null;
  rota: string | null;
  mensagem_teste: string | null;
  resposta_obtida: string | null;
  mensagens: unknown;
  raw_agente: unknown;
  raw_contexto: unknown;
  raw_handoff: unknown;
  erro: string | null;
};

type ExecutionOptions = {
  cliente_slug: string | null;
  rota: string | null;
};

const stateFilters = ["todas", "sucesso", "erro"];

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function getUniqueClients(rows: ExecutionOptions[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => row.cliente_slug)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function hasError(execution: Pick<AdminTestExecution, "erro">) {
  return Boolean(execution.erro?.trim());
}

function formatLabel(value: string | null, semValor: string) {
  if (!value) {
    return semValor;
  }

  return value.replaceAll("_", " ");
}

function stringifyMessage(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const candidate = value as {
      text?: unknown;
      content?: unknown;
      message?: unknown;
      resposta?: unknown;
    };

    for (const item of [
      candidate.text,
      candidate.content,
      candidate.message,
      candidate.resposta,
    ]) {
      if (typeof item === "string" && item.trim()) {
        return item;
      }
    }
  }

  return "";
}

function stringifyRaw(value: unknown) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getAgentResponseText(execution: AdminTestExecution) {
  const fallback = execution.resposta_obtida ? [execution.resposta_obtida] : [];
  const source = execution.mensagens;

  if (Array.isArray(source)) {
    const messages = source.map(stringifyMessage).filter(Boolean);

    return (messages.length > 0 ? messages : fallback).join("\n\n");
  }

  if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source) as unknown;

      if (Array.isArray(parsed)) {
        const messages = parsed.map(stringifyMessage).filter(Boolean);

        return (messages.length > 0 ? messages : fallback).join("\n\n");
      }
    } catch {
      // Mensagens em texto simples seguem para o fallback abaixo.
    }
  }

  return stringifyMessage(source) || fallback.join("\n\n");
}

export default async function AdminExecutionsPage({
  searchParams,
}: AdminExecutionsPageProps) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "lexia_admin") {
    redirect("/app");
  }

  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const params = await searchParams;
  const selectedCliente = getSearchValue(params.cliente);
  const requestedRota = getSearchValue(params.rota);
  const requestedEstado = getSearchValue(params.estado);
  const selectedEstado = stateFilters.includes(requestedEstado)
    ? requestedEstado
    : "todas";

  const supabase = await createClient();
  // Leve: só cliente e rota, para montar as barras de filtro com o que existe.
  const { data: optionsData, error: optionsError } = await supabase
    .from("lexia_testes_execucoes")
    .select("cliente_slug, rota")
    .order("cliente_slug");

  if (optionsError) {
    throw new Error(t("Não foi possível buscar as opções de filtro."));
  }

  const opcoes = (optionsData ?? []) as ExecutionOptions[];
  const contagemRotas = new Map<string, number>();
  for (const linha of opcoes) {
    if (
      linha.rota &&
      (!selectedCliente || linha.cliente_slug === selectedCliente)
    ) {
      contagemRotas.set(linha.rota, (contagemRotas.get(linha.rota) ?? 0) + 1);
    }
  }
  const rotas = [...contagemRotas.entries()].sort((a, b) => b[1] - a[1]);
  const selectedRota = contagemRotas.has(requestedRota) ? requestedRota : "";

  const { data: executionsData, error: executionsError } = await (() => {
    let query = supabase
      .from("lexia_testes_execucoes")
      .select(
        "id, cliente_slug, session_id, run_id, teste_id, criado_em, origem, rota, mensagem_teste, resposta_obtida, mensagens, raw_agente, raw_contexto, raw_handoff, erro",
      )
      .order("criado_em", { ascending: false });

    if (selectedCliente) {
      query = query.eq("cliente_slug", selectedCliente);
    }

    if (selectedRota) {
      query = query.eq("rota", selectedRota);
    }

    return query;
  })();

  if (executionsError) {
    throw new Error(t("Não foi possível buscar as execuções de teste."));
  }

  const clientes = getUniqueClients(opcoes);
  const todas = (executionsData ?? []) as AdminTestExecution[];
  const executions = todas.filter((execution) => {
    if (selectedEstado === "erro") {
      return hasError(execution);
    }

    if (selectedEstado === "sucesso") {
      return !hasError(execution);
    }

    return true;
  });

  // Números do topo: sobre o cliente e a rota escolhidos, sem o filtro de estado.
  const totalErro = todas.filter(hasError).length;
  const totalSucesso = todas.length - totalErro;
  const doPainelCliente = todas.filter(
    (execution) => execution.origem === "painel_cliente",
  ).length;
  // "Hoje" no fuso de cada cliente.
  const diaDe = (iso: string, slug: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: getClientTimezone(slug),
    }).format(new Date(iso));
  const agora = new Date().toISOString();
  const deHoje = todas.filter(
    (execution) =>
      execution.criado_em &&
      diaDe(execution.criado_em, execution.cliente_slug) ===
        diaDe(agora, execution.cliente_slug),
  );
  const hojeErro = deHoje.filter(hasError).length;
  const numero = new Intl.NumberFormat(locale);

  const href = (mudar: {
    cliente?: string;
    estado?: string;
    rota?: string;
  }) => {
    const p = new URLSearchParams();
    const cliente = mudar.cliente ?? selectedCliente;
    // Trocar de cliente limpa a rota (cada cliente tem as suas).
    const rota =
      mudar.cliente !== undefined ? "" : (mudar.rota ?? selectedRota);
    const estado = mudar.estado ?? selectedEstado;
    if (cliente) p.set("cliente", cliente);
    if (rota) p.set("rota", rota);
    if (estado && estado !== "todas") p.set("estado", estado);
    const qs = p.toString();
    return qs ? `/admin/execucoes?${qs}` : "/admin/execucoes";
  };

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        acoes={
          <Link
            className="ds-botao ds-botao-primario"
            href="/admin/area-testes"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t("Executar novo teste")}
          </Link>
        }
        destaque={
          deHoje.length === 0
            ? undefined
            : deHoje.length === 1
              ? t("1 execução hoje")
              : t("{n} execuções hoje", { n: numero.format(deHoje.length) })
        }
        resto={
          deHoje.length === 0
            ? t("Nenhuma execução hoje.")
            : hojeErro === 0
              ? t("nenhuma com erro.")
              : t("{n} com erro.", { n: numero.format(hojeErro) })
        }
        sobretitulo={t("Execuções")}
        subtitulo={t("{n} no total", { n: numero.format(todas.length) })}
      />

      <GradeMetricas colunas={totalErro > 0 ? 4 : 3}>
        <CartaoMetrica
          cor="var(--ds-info)"
          icone={<Activity aria-hidden="true" className="h-4 w-4" />}
          rotulo={t("Total de execuções")}
          valor={numero.format(todas.length)}
        />
        <CartaoMetrica
          cor="var(--ds-acao)"
          icone={<Check aria-hidden="true" className="h-4 w-4" />}
          nota={
            todas.length > 0
              ? t("{p} do total", {
                  p: new Intl.NumberFormat(locale, { style: "percent" }).format(
                    totalSucesso / todas.length,
                  ),
                })
              : undefined
          }
          rotulo={t("Sucesso")}
          valor={numero.format(totalSucesso)}
        />
        {totalErro > 0 ? (
          <CartaoMetrica
            cor="var(--ds-perigo)"
            href={href({ estado: "erro" })}
            icone={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}
            rotulo={t("Com erro")}
            valor={numero.format(totalErro)}
          />
        ) : null}
        {/* Com 3 cartões, o último ocupa a linha inteira no celular. */}
        <div className={totalErro > 0 ? "" : "col-span-2 xl:col-span-1"}>
          <CartaoMetrica
            cor="var(--ds-ouro)"
            icone={<UserRound aria-hidden="true" className="h-4 w-4" />}
            rotulo={t("Painel cliente")}
            valor={numero.format(doPainelCliente)}
          />
        </div>
      </GradeMetricas>

      <div className="flex min-w-0 flex-col gap-2">
        <FiltroTrilho
          opcoes={[
            {
              ativo: !selectedCliente,
              href: href({ cliente: "" }),
              label: t("Todos"),
            },
            ...clientes.map((cliente) => ({
              ativo: selectedCliente === cliente,
              href: href({ cliente }),
              label: cliente,
            })),
          ]}
          rotulo={t("Cliente")}
        />
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
          <div className="max-w-full shrink-0">
            <FiltroTrilho
              opcoes={[
                {
                  ativo: selectedEstado === "todas",
                  href: href({ estado: "todas" }),
                  label: t("Todas"),
                  quantidade: todas.length,
                },
                {
                  ativo: selectedEstado === "sucesso",
                  href: href({ estado: "sucesso" }),
                  label: t("Sucesso"),
                  quantidade: totalSucesso,
                },
                {
                  ativo: selectedEstado === "erro",
                  href: href({ estado: "erro" }),
                  label: t("Erro"),
                  quantidade: totalErro,
                },
              ]}
              rotulo={t("Estado")}
            />
          </div>
          {rotas.length > 1 ? (
            <div className="min-w-0">
              <FiltroTrilho
                opcoes={[
                  {
                    ativo: !selectedRota,
                    href: href({ rota: "" }),
                    label: t("Todas as rotas"),
                  },
                  ...rotas.map(([rota, quantidade]) => ({
                    ativo: selectedRota === rota,
                    href: href({ rota }),
                    label: formatLabel(rota, rota),
                    quantidade,
                  })),
                ]}
                rotulo={t("Rota")}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="ds-bloco overflow-hidden">
        {executions.length > 0 ? (
          <ListaExecucoes
            itens={executions.map((execution) => ({
              data: execution.criado_em
                ? new Intl.DateTimeFormat(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: getClientTimezone(execution.cliente_slug),
                  }).format(new Date(execution.criado_em))
                : t("Sem data"),
              erro: hasError(execution) ? execution.erro : null,
              extra: (
                <TechnicalDetailsModal
                  rawAgente={stringifyRaw(execution.raw_agente)}
                  rawContexto={stringifyRaw(execution.raw_contexto)}
                  rawHandoff={stringifyRaw(execution.raw_handoff)}
                  runId={execution.run_id}
                  sessionId={execution.session_id}
                  testeId={execution.teste_id}
                />
              ),
              id: execution.id,
              ids: [
                {
                  rotulo: t("Sessão"),
                  valor: execution.session_id ?? t("Sem session_id"),
                },
                ...(execution.run_id
                  ? [{ rotulo: "run", valor: execution.run_id }]
                  : []),
                ...(execution.teste_id
                  ? [{ rotulo: "teste", valor: execution.teste_id }]
                  : []),
              ],
              mensagem: execution.mensagem_teste?.trim() || t("Sem mensagem"),
              resposta:
                getAgentResponseText(execution).trim() || t("Sem resposta"),
              selos: [
                execution.cliente_slug,
                execution.rota
                  ? formatLabel(execution.rota, "")
                  : t("Sem rota"),
                formatLabel(execution.origem, t("Sem valor")),
              ],
            }))}
            rotulos={{
              erro: t("Erro"),
              mensagem: t("Mensagem enviada"),
              resposta: t("Resposta obtida"),
              sucesso: t("Sucesso"),
            }}
          />
        ) : selectedEstado === "erro" ? (
          <VazioTela
            pose="feliz"
            texto={t(
              "Todas as execuções terminaram bem. Se algo falhar, aparece aqui primeiro.",
            )}
            titulo={t("Nenhum erro")}
          />
        ) : (
          <VazioTela
            acao={
              <Link
                className="ds-botao ds-botao-primario ds-botao-p"
                href="/admin/area-testes"
              >
                {t("Executar novo teste")}
              </Link>
            }
            texto={t("Cada mensagem enviada na Área de testes aparece aqui.")}
            titulo={t("Ainda não há execuções registradas.")}
          />
        )}
      </div>
    </section>
  );
}
