/**
 * De que empresa é o onboarding de um pedido.
 *
 * O que é que isto está a proteger
 * --------------------------------
 * O onboarding passa pelo `createAdminClient()` (service_role, ignora o RLS).
 * Uma conta de cliente nunca pode escolher a empresa: o que vem do navegador
 * não conta, só a sessão. Se `acessoAoOnboarding` aceitasse o slug pedido, a
 * conta da Jessica lia e escrevia o onboarding de outro cliente.
 * E a conta em onboarding só abre o onboarding.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

type Perfil = { role: string; cliente_slug: string | null; status: string | null } | null;
let perfil: Perfil = null;
const consultas: string[] = [];

mock.module("server-only", { defaultExport: {} });
mock.module("next/navigation", { namedExports: { redirect: (d: string) => { throw new Error("redirect:" + d); } } });
mock.module("@/lib/auth/profile", {
  namedExports: {
    getLoggedInUserProfile: async () => (perfil ? { user: { id: "u1" }, profile: perfil } : { user: null, profile: null }),
    isClientRole: (r: string) => r === "cliente_admin" || r === "cliente_operador",
  },
});
mock.module("@/lib/supabase/admin", {
  namedExports: {
    createAdminClient: () => ({
      from: (tabela: string) => ({
        select: () => ({
          eq: (_c: string, slug: string) => ({
            maybeSingle: async () => {
              consultas.push(`${tabela}:${slug}`);
              return { data: ["jessica_beauty", "miranda_skin_experts"].includes(slug) ? { slug } : null };
            },
          }),
        }),
      }),
    }),
  },
});

const { acessoAoOnboarding } = await import("@/lib/onboarding/acesso");
const ecras = await import("@/lib/auth/ecras");

test("conta de cliente: vale a empresa da sessão, peça o navegador o que pedir", async () => {
  perfil = { role: "cliente_admin", cliente_slug: "jessica_beauty", status: "ativo" };
  for (const pedida of [undefined, "", "miranda_skin_experts", "detail_by_cordeiro", { slug: "x" }, null]) {
    const a = await acessoAoOnboarding(pedida);
    assert.equal(a?.clienteSlug, "jessica_beauty", `pedida=${JSON.stringify(pedida)}`);
    assert.equal(a?.lexia, false);
  }
});

test("conta sem empresa, inativa ou sem sessão não entra", async () => {
  perfil = { role: "cliente_admin", cliente_slug: null, status: "ativo" };
  assert.equal(await acessoAoOnboarding("jessica_beauty"), null);
  perfil = { role: "cliente_operador", cliente_slug: "jessica_beauty", status: "inativo" };
  assert.equal(await acessoAoOnboarding(), null);
  perfil = null;
  assert.equal(await acessoAoOnboarding("jessica_beauty"), null);
  perfil = { role: "outro_papel", cliente_slug: "jessica_beauty", status: "ativo" };
  assert.equal(await acessoAoOnboarding("jessica_beauty"), null);
});

test("equipe da Lexia: a empresa pedida, mas só se existir", async () => {
  perfil = { role: "lexia_admin", cliente_slug: null, status: "ativo" };
  consultas.length = 0;
  assert.equal((await acessoAoOnboarding("jessica_beauty"))?.clienteSlug, "jessica_beauty");
  assert.deepEqual(consultas, ["lexia_clientes:jessica_beauty"], "o slug é confirmado na lexia_clientes");
  assert.equal(await acessoAoOnboarding("cliente_inventado"), null);
  assert.equal(await acessoAoOnboarding(), null, "sem cliente escolhido não há acesso");
});

test("a conta da Jessica abre só a Área de testes (onde aterra) e os Feedbacks", () => {
  const J = "jessica_beauty";
  assert.equal(ecras.soOnboarding(J), false, "já não está só no onboarding: o menu mostra as telas, as outras 'Em breve'");
  assert.equal(ecras.ecraDeEntrada(J), "/app/area-testes");
  const abertas = ["/app/area-testes", "/app/feedbacks"];
  for (const ecra of ecras.ECRAS_DO_PAINEL) assert.equal(ecras.ecraPermitido(J, ecra), abertas.includes(ecra), ecra);
  // quem vê o painel inteiro não está em onboarding; a demo da Braz também não
  assert.equal(ecras.soOnboarding("detail_by_cordeiro"), false);
  assert.equal(ecras.soOnboarding("braz_insurance"), false);
  assert.equal(ecras.soOnboarding(null), false);
});

test("sessão expirada responde 401 com motivo (a tela guarda e reenvia); sem permissão continua 403", async () => {
  const { acessoOuMotivo, respostaSemAcesso } = await import("@/lib/onboarding/acesso");
  perfil = null;
  assert.deepEqual(await acessoOuMotivo("jessica_beauty"), { sem: "sessao" });
  const r = respostaSemAcesso("sessao");
  assert.equal(r.status, 401);
  assert.equal(((await r.json()) as { motivo: string }).motivo, "sessao");
  perfil = { role: "cliente_admin", cliente_slug: null, status: "ativo" };
  assert.deepEqual(await acessoOuMotivo("jessica_beauty"), { sem: "permissao" });
  assert.equal(respostaSemAcesso("permissao").status, 403);
});
