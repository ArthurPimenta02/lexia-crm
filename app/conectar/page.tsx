import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LexiaBrand } from "@/app/components/lexia-brand";
import { getLoggedInUserProfile } from "@/lib/auth/profile";
import { getT } from "@/lib/i18n/servidor";
import { configMeta, criarEstado, urlDoLogin } from "@/lib/meta/conectar";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ligar o Instagram do cliente à Lexia (app Meta da Lexia, login unificado).
 * O cliente_admin liga a conta do seu próprio negócio; o lexia_admin escolhe o
 * cliente. A volta do login da Meta é tratada em /conectar/meta (route.ts).
 */
export const metadata: Metadata = { title: "Instagram · Lexia" };
export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  config: "O app da Meta ainda não está configurado no painel.",
  cancelado: "A ligação foi cancelada na Meta.",
  sessao: "A sua sessão expirou. Entre de novo e repita.",
  estado: "O link de ligação expirou. Tente de novo.",
  permissao: "Só o administrador da empresa pode ligar o Instagram.",
  sem_conta: "Nenhuma conta do Instagram foi autorizada. Repita e selecione a conta.",
  meta: "A Meta não concluiu a ligação. Tente de novo em alguns minutos.",
};

export default async function ConectarPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; ok?: string; erro?: string }>;
}) {
  const [{ user, profile }, t, q] = await Promise.all([getLoggedInUserProfile(), getT(), searchParams]);
  if (!user || !profile) redirect("/login?destino=/conectar");

  const ehAdmin = profile.role === "lexia_admin";
  const admin = createAdminClient();
  const { data: clientes } = ehAdmin
    ? await admin.from("lexia_clientes").select("slug, nome").order("nome")
    : { data: null };
  const cliente = ehAdmin ? (q.cliente ?? "") : (profile.cliente_slug ?? "");
  const podeLigar = ehAdmin || profile.role === "cliente_admin";

  const { data: atual } = cliente
    ? await admin
        .from("lexia_conexoes")
        .select("campos, atualizado_em")
        .eq("tipo", "meta_lexia")
        .eq("cliente_slug", cliente)
        .maybeSingle()
    : { data: null };
  const ligado = (atual?.campos as { username?: string } | null)?.username ?? null;

  const cfg = configMeta();
  const link = cfg && cliente && podeLigar ? urlDoLogin(cfg, criarEstado({ cliente, user: user.id }, cfg.appSecret)) : null;
  const voltarPara = ehAdmin ? "/admin" : "/app";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <LexiaBrand tone="light" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">{t("Ligar o Instagram à Lexia")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("A Lexia passa a receber as mensagens do Direct da sua conta e a responder por você, com as regras do seu negócio. Você pode desligar quando quiser.")}
        </p>

        {q.ok ? (
          <p className="mt-6 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
            {t("Instagram @{conta} ligado com sucesso.", { conta: q.ok })}
          </p>
        ) : null}
        {q.erro ? (
          <p className="mt-6 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm">
            {t(ERROS[q.erro] ?? ERROS.meta)}
          </p>
        ) : null}

        {ehAdmin ? (
          <form className="mt-8 flex gap-2" method="get">
            <select
              className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm"
              defaultValue={cliente}
              name="cliente"
            >
              <option value="">{t("Escolha o cliente")}</option>
              {(clientes ?? []).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.nome ?? c.slug}
                </option>
              ))}
            </select>
            <button className="h-10 rounded-lg border px-4 text-sm" type="submit">
              {t("Escolher")}
            </button>
          </form>
        ) : null}

        {cliente ? (
          <div className="mt-8 rounded-xl border p-5">
            <p className="text-sm text-muted-foreground">{t("Conta ligada")}</p>
            <p className="mt-1 text-lg font-medium">{ligado ? `@${ligado}` : t("Nenhuma")}</p>
            {link ? (
              <a
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                href={link}
              >
                {ligado ? t("Ligar outra conta") : t("Ligar Instagram")}
              </a>
            ) : !podeLigar ? (
              <p className="mt-4 text-sm text-muted-foreground">{t(ERROS.permissao)}</p>
            ) : !cfg ? (
              <p className="mt-4 text-sm text-muted-foreground">{t(ERROS.config)}</p>
            ) : null}
          </div>
        ) : null}

        <Link className="mt-8 inline-block text-sm text-muted-foreground" href={voltarPara}>
          {t("Voltar ao painel")}
        </Link>
      </div>
    </main>
  );
}
