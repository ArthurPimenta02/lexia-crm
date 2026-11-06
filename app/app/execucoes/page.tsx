import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Activity,
  AlertTriangle,
  Check,
  MessageSquare,
  Plus,
} from "lucide-react";

import { ListaExecucoes } from "@/app/app/execucoes/lista-execucoes";
import { CartaoMetrica } from "@/app/components/cartoes";
import {
  CabecalhoTela,
  FiltroTrilho,
  GradeMetricas,
  VazioTela,
} from "@/app/components/tela";
import { exigirEcra } from "@/lib/auth/ecras";
import { getLoggedInUserProfile, isClientRole } from "@/lib/auth/profile";
import { getClientTimezone } from "@/lib/clientes/timezone";
import { LOCALE_DO_IDIOMA } from "@/lib/i18n/idiomas";
import { getIdioma, getT } from "@/lib/i18n/servidor";
import { createClient } from "@/lib/supabase/server";

type ClientExecutionsPageProps = {
  searchParams: Promise<{
    rota?: string | string[];
    estado?: string | string[];
  }>;
};

type TestExecution = {
  id: string;
  session_id: string | null;
  run_id: string | null;
  teste_id: string | null;
  criado_em: string | null;
  origem: string | null;
  rota: string | null;
  mensagem_teste: string | null;
  resposta_obtida: string | null;
  mensagens: unknown;
  erro: string | null;
};

const stateFilters = ["todas", "sucesso", "erro"];

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function hasError(execution: Pick<TestExecution, "erro">) {
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

function getAgentResponseText(execution: TestExecution) {
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

export default async function ClientExecutionsPage({
  searchParams,
}: ClientExecutionsPageProps) {
  const { profile } = await getLoggedInUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!isClientRole(profile.role)) {
    redirect("/admin");
  }

  exigirEcra(profile.cliente_slug, "/app/execucoes");

  if (!profile.cliente_slug) {
    redirect("/app");
  }

  const t = await getT();
  const locale = LOCALE_DO_IDIOMA[await getIdioma()];
  const params = await searchParams;
  const requestedRota = getSearchValue(params.rota);
  const requestedEstado = getSearchValue(params.estado);
  const selectedEstado = stateFilters.includes(requestedEstado)
    ? requestedEstado
    : "todas";

  const timeZone = getClientTimezone(profile.cliente_slug);
  const supabase = await createClient();
  // Busca tudo e filtra a rota aqui: assim a barra de rotas mostra as rotas
  // que existem de verdade (a lista fixa antiga já não batia com os dados).
  const { data, error } = await supabase
    .from("lexia_testes_execucoes")
    .select(
      "id, session_id, run_id, teste_id, criado_em, origem, rota, mensagem_teste, resposta_obtida, mensagens, erro",
    )
    .eq("cliente_slug", profile.cliente_slug)
    .order("criado_em", { ascending: false });

  if (error) {
    throw new Error(t("Não foi possível buscar as execuções de teste."));
  }

  const semFiltro = (data ?? []) as TestExecution[];
  const contagemRotas = new Map<string, number>();
  for (const execution of semFiltro) {
    if (execution.rota) {
      contagemRotas.set(
        execution.rota,
        (contagemRotas.get(execution.rota) ?? 0) + 1,
      );
    }
  }
  const rotas = [...contagemRotas.entries()].sort((a, b) => b[1] - a[1]);
  const selectedRota = contagemRotas.has(requestedRota) ? requestedRota : "";
  const todas = selectedRota
    ? semFiltro.filter((execution) => execution.rota === selectedRota)
    : semFiltro;
  const executions = todas.filter((execution) => {
    if (selectedEstado === "erro") {
      return hasError(execution);
    }

    if (selectedEstado === "sucesso") {
      return !hasError(execution);
    }

    return true;
  });

  // Números do topo: sempre sobre a rota escolhida, sem o filtro de estado.
  const totalErro = todas.filter(hasError).length;
  const totalSucesso = todas.length - totalErro;
  const sessoes = new Set(
    todas.map((execution) => execution.session_id).filter(Boolean),
  ).size;
  const diaDe = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
  const hoje = diaDe(new Date().toISOString());
  const deHoje = todas.filter(
    (execution) => execution.criado_em && diaDe(execution.criado_em) === hoje,
  );
  const hojeErro = deHoje.filter(hasError).length;
  const numero = new Intl.NumberFormat(locale);
  const formatoData = new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  });

  const href = (mudar: { estado?: string; rota?: string }) => {
    const p = new URLSearchParams();
    const rota = mudar.rota ?? selectedRota;
    const estado = mudar.estado ?? selectedEstado;
    if (rota) p.set("rota", rota);
    if (estado && estado !== "todas") p.set("estado", estado);
    const qs = p.toString();
    return qs ? `/app/execucoes?${qs}` : "/app/execucoes";
  };

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        acoes={
          <Link className="ds-botao ds-botao-primario" href="/app/area-testes">
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
          rotulo={t("Execuções")}
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
            icone={<MessageSquare aria-hidden="true" className="h-4 w-4" />}
            rotulo={t("Conversas de teste")}
            valor={numero.format(sessoes)}
          />
        </div>
      </GradeMetricas>

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

      <div className="ds-bloco overflow-hidden">
        {executions.length > 0 ? (
          <ListaExecucoes
            itens={executions.map((execution) => ({
              data: execution.criado_em
                ? formatoData.format(new Date(execution.criado_em))
                : t("Sem data"),
              erro: hasError(execution) ? execution.erro : null,
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
                href="/app/area-testes"
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
