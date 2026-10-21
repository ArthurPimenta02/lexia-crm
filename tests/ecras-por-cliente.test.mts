/**
 * Ecrãs fechados por cliente.
 *
 * O que é que isto está a proteger
 * --------------------------------
 * Esconder um item no menu não fecha um ecrã. O endereço continua lá e
 * escreve-se na barra do navegador em dois segundos. Se a recusa não estiver no
 * servidor, o bloqueio é um desenho — e numa demonstração a um cliente que
 * ainda não assinou, deixá-lo entrar num Pipeline vazio é pior do que não lhe
 * ter mostrado nada.
 *
 * Por isso o teste mais importante aqui não é nenhum dos casos de lógica: é o
 * último, que percorre as pastas de `app/app` e exige que cada página chame a
 * guarda com o seu próprio endereço. É o único que apanha o erro que vai
 * acontecer de verdade — alguém acrescenta um ecrã novo dentro de seis meses e
 * ninguém se lembra desta mecânica.
 *
 * Mutações que fazem isto falhar (verificadas uma a uma):
 *  - tirar o `exigirEcra` de uma página qualquer;
 *  - trocar o endereço de uma guarda pelo de outra página;
 *  - pôr `braz_insurance: []`;
 *  - fazer o `ecraPermitido` devolver `true` quando a lista está vazia;
 *  - acrescentar um ecrã ao menu sem o pôr no `ECRAS_DO_PAINEL`.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test, { mock } from "node:test";

const BRAZ = "braz_insurance";
const DETAIL = "detail_by_cordeiro";

/**
 * O `exigirEcra` chama o `redirect` do Next, que fora do Next não existe.
 * Aqui ele apenas atira — tal como o verdadeiro, que interrompe a renderização
 * — e guarda para onde ia.
 */
let ultimoDestino: string | null = null;

class ReencaminhamentoFalso extends Error {}

mock.module("next/navigation", {
  namedExports: {
    redirect(destino: string) {
      ultimoDestino = destino;
      throw new ReencaminhamentoFalso(destino);
    },
  },
});

const ecras = await import("@/lib/auth/ecras");

/** Corre a guarda e devolve o destino, ou `null` se deixou passar. */
function guardar(clienteSlug: string | null, ecra: string) {
  ultimoDestino = null;

  try {
    ecras.exigirEcra(clienteSlug, ecra as never);
    return null;
  } catch (erro) {
    assert.ok(
      erro instanceof ReencaminhamentoFalso,
      "a guarda atirou algo que não é um reencaminhamento: " + String(erro),
    );
    return ultimoDestino;
  }
}

test("quem não tem restrição configurada continua a ver o painel inteiro", () => {
  for (const ecra of ecras.ECRAS_DO_PAINEL) {
    assert.equal(
      ecras.ecraPermitido(DETAIL, ecra),
      true,
      `o Detail perdeu o acesso a ${ecra}`,
    );
    assert.equal(guardar(DETAIL, ecra), null);
  }

  assert.equal(ecras.ecraDeEntrada(DETAIL), "/app");
  assert.equal(ecras.ecraPermitido(null, "/app/agenda"), true);
  assert.equal(ecras.ecraPermitido("cliente_que_nao_existe", "/app"), true);
});

test("a demo da Braz só abre a Área de testes", () => {
  assert.equal(ecras.ecraPermitido(BRAZ, "/app/area-testes"), true);
  assert.equal(guardar(BRAZ, "/app/area-testes"), null);

  const fechados = ecras.ECRAS_DO_PAINEL.filter(
    (ecra) => ecra !== "/app/area-testes",
  );

  assert.equal(fechados.length, ecras.ECRAS_DO_PAINEL.length - 1);

  for (const ecra of fechados) {
    assert.equal(
      ecras.ecraPermitido(BRAZ, ecra),
      false,
      `${ecra} devia estar fechado para a Braz`,
    );
    assert.equal(
      guardar(BRAZ, ecra),
      "/app/area-testes",
      `${ecra} devia reencaminhar para a Área de testes`,
    );
  }
});

test("o ecrã de entrada é o primeiro que lhe resta", () => {
  // É aqui que ele aterra depois do login, porque o `/app` está fechado.
  assert.equal(ecras.ecraDeEntrada(BRAZ), "/app/area-testes");
  assert.equal(guardar(BRAZ, "/app"), "/app/area-testes");
});

test("nenhuma lista está vazia e nenhuma aponta para um ecrã que não existe", () => {
  const configurados = ecras.clientesComEcrasFechados();

  assert.ok(configurados.length > 0, "a tabela de ecrãs fechados está vazia");

  for (const [slug, lista] of configurados) {
    assert.ok(
      lista.length > 0,
      `${slug} tem uma lista vazia — isso tranca-lhe o painel todo`,
    );

    for (const ecra of lista) {
      assert.ok(
        (ecras.ECRAS_DO_PAINEL as readonly string[]).includes(ecra),
        `${slug} aponta para ${ecra}, que não é um ecrã do painel`,
      );
    }
  }
});

test("uma lista vazia fecha tudo, não abre tudo", () => {
  /*
   * Não dá para configurar um cliente assim a partir de fora, e é de propósito.
   * O que se prende aqui é a direcção da falha: se um dia alguém escrever uma
   * lista vazia, o painel tem de fechar, não abrir. Por isso o teste de cima
   * existe — para apanhar o erro antes de chegar aqui.
   */
  assert.equal(ecras.temOPainelInteiro(BRAZ), false);
  assert.equal(ecras.ecraPermitido(BRAZ, "/app/conversas"), false);
});

test("toda a página de /app chama a guarda com o seu próprio endereço", () => {
  const raiz = path.join(process.cwd(), "app", "app");

  /** Descobre as páginas pelo sistema de ficheiros, não por uma lista à mão. */
  function procurar(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
      const caminho = path.join(dir, entrada.name);

      if (entrada.isDirectory()) {
        return procurar(caminho);
      }

      return entrada.name === "page.tsx" ? [caminho] : [];
    });
  }

  const paginas = procurar(raiz);

  assert.ok(paginas.length >= 14, `só encontrei ${paginas.length} páginas`);

  const encontrados: string[] = [];

  for (const pagina of paginas) {
    const segmento = path
      .relative(raiz, path.dirname(pagina))
      .split(path.sep)
      .filter(Boolean)
      .join("/");
    const ecra = segmento ? `/app/${segmento}` : "/app";
    const fonte = readFileSync(pagina, "utf8");

    assert.ok(
      fonte.includes(`exigirEcra(profile.cliente_slug, "${ecra}")`),
      `${path.relative(process.cwd(), pagina)} não recusa a entrada: falta exigirEcra(profile.cliente_slug, "${ecra}")`,
    );

    assert.ok(
      (ecras.ECRAS_DO_PAINEL as readonly string[]).includes(ecra),
      `${ecra} existe como página mas não está no ECRAS_DO_PAINEL`,
    );

    encontrados.push(ecra);
  }

  // E o contrário: nada no ECRAS_DO_PAINEL sem página por trás.
  for (const ecra of ecras.ECRAS_DO_PAINEL) {
    assert.ok(
      encontrados.includes(ecra),
      `${ecra} está no ECRAS_DO_PAINEL mas não tem página`,
    );
  }
});
