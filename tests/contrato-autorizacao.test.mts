/**
 * O contrato que todas as server actions têm de cumprir, lido no código-fonte.
 *
 * Os outros dois testes exercitam duas acções a sério. Este não exercita
 * nenhuma: lê os 18 ficheiros de acções e afirma a forma que todos têm de ter.
 * A razão é que o risco aqui não é uma acção estar errada — é uma acção **nova**
 * nascer errada. Um teste de comportamento só cobre o que alguém se lembrou de
 * escrever; este cobre o ficheiro que ainda não existe.
 *
 * As duas formas legítimas:
 *
 * - `app/app/**` (painel do cliente) — o `cliente_slug` vem do perfil no
 *   servidor. Ler `cliente_slug` do formulário aqui é a falha: o formulário vem
 *   do navegador e o Martim pode escrever o slug da Miranda.
 * - `app/admin/**` (painel da Lexia) — aí o `cliente_slug` do formulário é
 *   legítimo, é o selector de cliente. Mas então tem de ser validado contra a
 *   `lexia_clientes`, senão aceita-se um slug inventado.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function procurarAccoes(pasta: string): string[] {
  const encontrados: string[] = [];

  for (const entrada of readdirSync(path.join(raiz, pasta), {
    withFileTypes: true,
  })) {
    const caminho = `${pasta}/${entrada.name}`;

    if (entrada.isDirectory()) {
      encontrados.push(...procurarAccoes(caminho));
    } else if (entrada.name === "actions.ts") {
      encontrados.push(caminho);
    }
  }

  return encontrados;
}

const ficheiros = [
  "app/actions/agent-pause.ts",
  "app/actions/auth.ts",
  ...procurarAccoes("app/admin"),
  ...procurarAccoes("app/app"),
].sort();

const fonte = new Map(
  ficheiros.map((caminho) => [
    caminho,
    readFileSync(path.join(raiz, caminho), "utf8"),
  ]),
);

/** Comentários explicam o contrato; não o cumprem. Só conta o código. */
function semComentarios(texto: string) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const codigo = new Map<string, string>(
  [...fonte].map(([caminho, texto]) => [caminho, semComentarios(texto)]),
);

const leSlugDoFormulario = (texto: string) =>
  /formData\s*\.\s*get\(\s*["']cliente_slug["']\s*\)/.test(texto);

test("os ficheiros de acções foram todos encontrados", () => {
  assert.ok(
    ficheiros.length >= 18,
    `só encontrei ${ficheiros.length} ficheiros de acções; o glob deve ter deixado de corresponder`,
  );
});

test("nenhuma acção do painel do cliente aceita o cliente_slug do formulário", () => {
  const infractores = [...codigo]
    .filter(([caminho]) => caminho.startsWith("app/app/"))
    .filter(([, texto]) => leSlugDoFormulario(texto))
    .map(([caminho]) => caminho);

  assert.deepEqual(
    infractores,
    [],
    "no painel do cliente o slug vem do perfil, nunca do navegador",
  );
});

test("toda a acção identifica quem está a pedir", () => {
  const semPerfil = [...codigo]
    .filter(([, texto]) => !texto.includes("getLoggedInUserProfile"))
    .map(([caminho]) => caminho);

  assert.deepEqual(semPerfil, []);
});

test("toda a acção do painel da Lexia verifica o papel lexia_admin", () => {
  const semVerificacao = [...codigo]
    .filter(([caminho]) => caminho.startsWith("app/admin/"))
    .filter(([, texto]) => !texto.includes("lexia_admin"))
    .map(([caminho]) => caminho);

  assert.deepEqual(semVerificacao, []);
});

test("quem aceita o slug do formulário confirma-o na lexia_clientes", () => {
  const porConfirmar = [...codigo]
    .filter(([, texto]) => leSlugDoFormulario(texto))
    .filter(([, texto]) => !texto.includes("lexia_clientes"))
    .map(([caminho]) => caminho);

  assert.deepEqual(
    porConfirmar,
    [],
    "um slug vindo do navegador que não existe na lexia_clientes é um slug inventado",
  );
});

/**
 * O painel do cliente usa mesmo o `service_role` em dois sítios (área de testes
 * e handoffs), para apagar linhas que o RLS não deixaria. Aí o RLS desaparece e
 * o `.eq("cliente_slug", …)` passa a ser a única coisa entre uma empresa e os
 * dados da outra. Logo: toda a consulta que vá por esse cliente amarra o slug.
 */
test("no painel do cliente, toda a consulta com service_role amarra o cliente_slug", () => {
  const faltas: string[] = [];

  for (const [caminho, texto] of codigo) {
    if (!caminho.startsWith("app/app/")) {
      continue;
    }

    const variaveis = [...texto.matchAll(/(\w+)\s*=\s*createAdminClient\(/g)].map(
      (achado) => achado[1],
    );

    if (variaveis.length === 0) {
      continue;
    }

    const padrao = new RegExp(`\\b(${variaveis.join("|")})\\b`);

    for (const instrucao of texto.split(";")) {
      if (!instrucao.includes(".from(") || !padrao.test(instrucao)) {
        continue;
      }

      if (/\.eq\(\s*["']cliente_slug["']/.test(instrucao)) {
        continue;
      }

      const tabela = /\.from\(\s*["']([^"']+)["']/.exec(instrucao)?.[1];
      faltas.push(`${caminho}: consulta a ${tabela} sem .eq("cliente_slug")`);
    }
  }

  assert.deepEqual(faltas, []);
});
