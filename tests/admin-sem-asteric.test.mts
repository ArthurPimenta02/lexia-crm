// 24/11 (Arthur): a Asteric sai de todas as telas do admin (só fica o login da própria conta);
// quem está em teste (ex.: Jessica, inativa) aparece no acesso rápido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { OCULTOS_NO_ADMIN, FILTRO_OCULTOS, NO_AR_OU_EM_TESTE, ocultoNoAdmin } from "../lib/clientes/ocultos";

test("asteric está nos ocultos do admin; o filtro do PostgREST sai certo", () => {
  // 28/11: as contas internas "Detail (teste)" e "Demo Dev Lexia" também saem.
  assert.deepEqual([...OCULTOS_NO_ADMIN], ["asteric", "cliente_teste", "clinica_teste"]);
  assert.equal(FILTRO_OCULTOS, "(asteric,cliente_teste,clinica_teste)");
  assert.equal(ocultoNoAdmin("asteric"), true);
  assert.equal(ocultoNoAdmin("cliente_teste"), true);
  assert.equal(ocultoNoAdmin("clinica_teste"), true);
  assert.equal(ocultoNoAdmin("jessica_beauty"), false);
});

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : []; });
}

test("toda LISTA de clientes no admin filtra os ocultos (consultas a lexia_clientes que não são de um slug só)", () => {
  const falta: string[] = [];
  for (const f of arquivos("app/admin")) {
    if (/actions\.ts$/.test(f)) continue;   // ações escrevem/validam um cliente pelo slug
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/\.from\("lexia_clientes"\)([\s\S]{0,260})/g)) {
      const resto = m[1];
      if (/\.eq\("slug"|\.in\("slug"/.test(resto) && !/FILTRO_OCULTOS/.test(resto)) {
        if (/\.in\("slug", slugs\)/.test(resto) && /ocultoNoAdmin/.test(s)) continue;   // funil: slugs já filtrados
        continue;   // um cliente só (página dele)
      }
      if (!/FILTRO_OCULTOS/.test(resto)) falta.push(f);
    }
  }
  assert.deepEqual(falta, [], `sem filtro dos ocultos: ${falta.join(", ")}`);
});

test("acesso rápido: entram os ativos e os em teste; ocultos fora", () => {
  const s = readFileSync("app/admin/layout.tsx", "utf8");
  assert.match(s, /\.or\("status\.eq\.ativo,modo_teste\.eq\.true"\)/);
  assert.match(s, /\.not\("slug", "in", FILTRO_OCULTOS\)/);
});

// 28/11 (Arthur): "adiciona a Jessica aqui" — os seletores de cliente do admin mostram os ativos E os em teste.
test("seletores de cliente do admin: ativos e em teste (a Jessica, inativa em teste, aparece)", () => {
  assert.equal(NO_AR_OU_EM_TESTE, "status.eq.ativo,modo_teste.eq.true");
  for (const tela of ["conversas", "analista", "campanhas", "servicos", "produtos"]) {
    const s = readFileSync(`app/admin/${tela}/page.tsx`, "utf8");
    assert.match(s, /\.or\(NO_AR_OU_EM_TESTE\)/, tela);
    assert.doesNotMatch(s, /\.from\("lexia_clientes"\)[\s\S]{0,200}\.eq\("status", "ativo"\)/, tela);
  }
});
