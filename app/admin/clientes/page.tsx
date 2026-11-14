import Link from "next/link";
import { redirect } from "next/navigation";

import { CabecalhoTela, FiltroTrilho, VazioTela } from "@/app/components/tela";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lista de clientes do admin (14/11/2026). Antes, a página de cada cliente
 * (/admin/clientes/<slug>) só se abria pelo endereço. Aqui: busca por nome ou
 * slug, filtro por situação, o essencial de cada um (estado, modo de teste,
 * follow-ups de 3 e 7 dias, quantos contactos) e o acesso à página dele.
 * Lido com a service_role, só lexia_admin.
 */

type ClientesPageProps = {
  searchParams: Promise<{ busca?: string | string[]; situacao?: string | string[] }>;
};

type Cliente = {
  slug: string;
  nome: string | null;
  status: string | null;
  modo_teste: boolean | null;
  cor_principal: string | null;
  followups_longos?: boolean | null;
};

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const normalizar = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const SITUACOES = ["", "no_ar", "teste", "inativo"] as const;
/**
 * Uma situação só por cliente (14/11): antes saíam "Ativo" (a conta) e "Modo teste"
 * (a etiqueta), e todos apareciam com as duas. Agora: Inativo/Suspenso se a conta não
 * está ativa; senão Em teste se o modo teste está marcado; senão No ar.
 */
type Situacao = "no_ar" | "teste" | "inativo" | "suspenso";
const situacaoDe = (c: { status: string | null; modo_teste: boolean | null }): Situacao =>
  (c.status ?? "ativo") === "suspenso" ? "suspenso"
  : (c.status ?? "ativo") !== "ativo" ? "inativo"
  : c.modo_teste ? "teste"
  : "no_ar";

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  const { profile } = await getLoggedInUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "lexia_admin") redirect("/app");

  const params = await searchParams;
  const t = await getT();
  const busca = primeiro(params.busca).slice(0, 80);
  const situacaoParam = primeiro(params.situacao);
  const situacao = (SITUACOES as readonly string[]).includes(situacaoParam) ? situacaoParam : "";

  const admin = createAdminClient();
  // A coluna followups_longos é de 14/11: se faltar na base, a página continua sem ela.
  const comLongos = await admin
    .from("lexia_clientes")
    .select("slug, nome, status, modo_teste, cor_principal, followups_longos")
    .order("nome");
  let clientes = (comLongos.data ?? []) as Cliente[];
  if (comLongos.error) {
    const semLongos = await admin.from("lexia_clientes").select("slug, nome, status, modo_teste, cor_principal").order("nome");
    if (semLongos.error) throw new Error("Não foi possível buscar os clientes.");
    clientes = (semLongos.data ?? []) as Cliente[];
  }

  // Quantos contactos cada cliente tem (conversas reais, sem as de teste).
  const contagens = new Map<string, number>();
  await Promise.all(
    clientes.map(async (c) => {
      const { count } = await admin
        .from("lexia_contactos")
        .select("id", { count: "exact", head: true })
        .eq("cliente_slug", c.slug)
        .not("identificador_conversa", "like", "teste:%");
      contagens.set(c.slug, count ?? 0);
    }),
  );

  const termo = normalizar(busca);
  const noFiltro = (c: Cliente, s: string) =>
    s === "" ? true : s === "inativo" ? ["inativo", "suspenso"].includes(situacaoDe(c)) : situacaoDe(c) === s;
  const daSituacao = (c: Cliente) => noFiltro(c, situacao);
  const porBusca = clientes.filter((c) => !termo || normalizar(`${c.nome ?? ""} ${c.slug}`).includes(termo));
  const visiveis = porBusca.filter(daSituacao);

  const href = (mudar: { busca?: string; situacao?: string }) => {
    const p = new URLSearchParams();
    const b = mudar.busca ?? busca;
    const s = mudar.situacao ?? situacao;
    if (b) p.set("busca", b);
    if (s) p.set("situacao", s);
    const q = p.toString();
    return `/admin/clientes${q ? `?${q}` : ""}`;
  };
  const contar = (s: string) => porBusca.filter((c) => noFiltro(c, s)).length;
  const nomeSituacao: Record<Situacao, string> = { no_ar: t("No ar"), teste: t("Em teste"), inativo: t("Inativo"), suspenso: t("Suspenso") };
  const seloSituacao: Record<Situacao, string> = { no_ar: "ds-selo-verde", teste: "ds-selo-ouro", inativo: "ds-selo-neutro", suspenso: "ds-selo-alerta" };

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <CabecalhoTela
        acoes={
          <Link className="ds-botao ds-botao-primario" href="/admin/clientes/novo">
            {t("Novo cliente")}
          </Link>
        }
        destaque={clientes.length === 1 ? t("1 cliente") : t("{n} clientes", { n: clientes.length })}
        resto={t("na Lexia.")}
        sobretitulo={t("Admin Lexia")}
      />

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <form action="/admin/clientes" className="flex min-w-0 flex-1 gap-2" method="get">
          {situacao ? <input name="situacao" type="hidden" value={situacao} /> : null}
          <input
            aria-label={t("Buscar cliente")}
            className="ds-campo min-w-0 flex-1"
            defaultValue={busca}
            name="busca"
            placeholder={t("Buscar por nome")}
            type="search"
          />
          <button className="ds-botao ds-botao-secundario" type="submit">
            {t("Buscar")}
          </button>
        </form>
        <FiltroTrilho
          opcoes={[
            { ativo: situacao === "", href: href({ situacao: "" }), label: t("Todos"), quantidade: contar("") },
            { ativo: situacao === "no_ar", href: href({ situacao: "no_ar" }), label: t("No ar"), quantidade: contar("no_ar") },
            { ativo: situacao === "teste", href: href({ situacao: "teste" }), label: t("Em teste"), quantidade: contar("teste") },
            { ativo: situacao === "inativo", href: href({ situacao: "inativo" }), label: t("Inativos"), quantidade: contar("inativo") },
          ]}
          rotulo={t("Situação")}
        />
      </div>

      <section className="ds-bloco min-w-0 overflow-hidden">
        {visiveis.length === 0 ? (
          <VazioTela
            pose="ola"
            texto={busca ? t("Confira o nome ou limpe a busca.") : t("Ainda não há clientes nesta situação.")}
            titulo={busca ? t("Nenhum cliente encontrado para “{busca}”.", { busca }) : t("Nenhum cliente aqui.")}
          />
        ) : (
          <div className="tela-lista p-1.5">
            {visiveis.map((c) => {
              const sit = situacaoDe(c);
              const contactos = contagens.get(c.slug) ?? 0;
              return (
                <Link className="tela-linha flex-wrap sm:flex-nowrap" href={`/admin/clientes/${encodeURIComponent(c.slug)}`} key={c.slug}>
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ background: c.cor_principal || "var(--ds-texto-3)" }}
                  >
                    {(c.nome || c.slug).trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">{c.nome || c.slug}</span>
                      <span className={`ds-selo ${seloSituacao[sit]}`}>{nomeSituacao[sit]}</span>
                      {c.followups_longos ? <span className="ds-selo ds-selo-neutro">{t("Follow-ups de 3 e 7 dias")}</span> : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      <span className="font-mono">{c.slug}</span>
                      {" · "}
                      {contactos === 1 ? t("1 contato") : t("{n} contatos", { n: contactos })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-muted-foreground">{t("Abrir")} →</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
