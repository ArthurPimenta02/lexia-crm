/**
 * Nenhuma data se escreve no ecrã sem dizer em que fuso.
 *
 * O defeito que isto tranca: `new Intl.DateTimeFormat(...)` sem `timeZone` usa
 * o fuso da máquina. No servidor da Vercel a máquina está em UTC, por isso uma
 * data renderizada no servidor aparecia em UTC; num componente `"use client"`
 * aparecia em UTC no servidor e no fuso do browser depois de hidratar — duas
 * respostas diferentes para a mesma data. Medido na base real: 1206 das 7333
 * mensagens da Miranda (16,4%) mostravam o dia errado.
 *
 * O teste que importa mais aqui é o último: é um varrimento do código que
 * falha se alguém voltar a formatar uma data sem fuso. Os outros garantem que
 * o fuso por omissão é o do cliente e não o do Brasil.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  fallbackTimezone,
  formatDateInTimezone,
  formatDayInTimezone,
  getClientTimezone,
  getSelectedTimezone,
} from "@/lib/clientes/timezone";

const raiz = new URL("..", import.meta.url).pathname;

test("cada cliente tem o seu fuso e os de fora do mapa caem no de reserva", () => {
  assert.equal(getClientTimezone("detail_by_cordeiro"), "Europe/Lisbon");
  assert.equal(getClientTimezone("miranda_skin_experts"), "America/New_York");
  assert.equal(getClientTimezone("cliente_novo"), fallbackTimezone);
});

test("sem escolha na barra, as conversas abrem no fuso do cliente", () => {
  assert.equal(
    getSelectedTimezone(undefined, "miranda_skin_experts").timeZone,
    "America/New_York",
  );
  assert.equal(
    getSelectedTimezone(undefined, "detail_by_cordeiro").timeZone,
    "Europe/Lisbon",
  );
});

test("a escolha manual do dono ganha ao fuso do cliente", () => {
  assert.equal(
    getSelectedTimezone("brasil", "miranda_skin_experts").timeZone,
    "America/Sao_Paulo",
  );
});

test("um valor inventado no link não parte a página", () => {
  assert.equal(
    getSelectedTimezone("marte", "detail_by_cordeiro").timeZone,
    "Europe/Lisbon",
  );
  assert.equal(getSelectedTimezone("marte", null).timeZone, fallbackTimezone);
});

/**
 * O caso concreto que motivou tudo: uma mensagem das 09:45 em Boston. O
 * servidor da Vercel está em UTC e mostrava 13:45.
 */
test("a mesma hora UTC dá horas diferentes consoante o fuso", () => {
  const instante = "2026-10-16T13:45:00.000Z";

  assert.equal(
    formatDateInTimezone(instante, "America/New_York"),
    "16/10/2026, 09:45",
  );
  assert.equal(
    formatDateInTimezone(instante, "Europe/Lisbon"),
    "16/10/2026, 14:45",
  );
});

/** Perto da meia-noite o fuso decide o dia, não só a hora. */
test("perto da meia-noite o fuso muda o dia mostrado", () => {
  const instante = "2026-10-16T02:30:00.000Z";

  assert.equal(formatDayInTimezone(instante, "America/New_York"), "15/10/2026");
  assert.equal(formatDayInTimezone(instante, "Europe/Lisbon"), "16/10/2026");
});

function listarFicheiros(pasta: string): string[] {
  const encontrados: string[] = [];

  for (const entrada of readdirSync(pasta)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) {
      continue;
    }

    const caminho = join(pasta, entrada);

    if (statSync(caminho).isDirectory()) {
      encontrados.push(...listarFicheiros(caminho));
      continue;
    }

    if (caminho.endsWith(".ts") || caminho.endsWith(".tsx")) {
      encontrados.push(caminho);
    }
  }

  return encontrados;
}

/** O texto entre os parênteses de uma chamada, contando os aninhados. */
function lerArgumentos(fonte: string, aberturaIndex: number) {
  let profundidade = 0;

  for (let index = aberturaIndex; index < fonte.length; index += 1) {
    if (fonte[index] === "(") {
      profundidade += 1;
    }

    if (fonte[index] === ")") {
      profundidade -= 1;

      if (profundidade === 0) {
        return fonte.slice(aberturaIndex + 1, index);
      }
    }
  }

  return fonte.slice(aberturaIndex + 1);
}

/**
 * Este é o teste que trava a reincidência. Formatar sem `timeZone` é uma linha
 * que parece inofensiva e passa em revisão sem dar nas vistas — por isso tem
 * de ser a máquina a apanhá-la.
 */
test("ninguém formata uma data sem dizer o fuso", () => {
  const marca = "new Intl.DateTimeFormat(";
  const faltas: string[] = [];

  for (const pasta of ["app", "lib"]) {
    for (const caminho of listarFicheiros(join(raiz, pasta))) {
      const fonte = readFileSync(caminho, "utf8");
      let procurarDe = 0;

      while (true) {
        const inicio = fonte.indexOf(marca, procurarDe);

        if (inicio === -1) {
          break;
        }

        const aberturaIndex = inicio + marca.length - 1;
        const argumentos = lerArgumentos(fonte, aberturaIndex);

        if (!argumentos.includes("timeZone")) {
          const linha = fonte.slice(0, inicio).split("\n").length;

          faltas.push(`${caminho.slice(raiz.length)}:${linha}`);
        }

        procurarDe = aberturaIndex + 1;
      }
    }
  }

  assert.deepEqual(
    faltas,
    [],
    `Estas datas são formatadas sem fuso e saem erradas no servidor da Vercel, que corre em UTC. Use formatDateInTimezone ou formatDayInTimezone de @/lib/clientes/timezone:\n${faltas.join("\n")}`,
  );
});

/**
 * O fuso de cada cliente tem de viver num sítio só. Espalhado por `if`s nas
 * páginas, um cliente novo fica a ver as horas do Brasil em metade do produto
 * e no fuso certo na outra metade.
 */
test("o fuso de cada cliente só está escrito no módulo do fuso", () => {
  const fusosConhecidos = ["Europe/Lisbon", "America/New_York"];
  const permitidos = [
    "lib/clientes/timezone.ts",
    "tests/fuso-horario.test.mts",
  ];
  const faltas: string[] = [];

  for (const pasta of ["app", "lib"]) {
    for (const caminho of listarFicheiros(join(raiz, pasta))) {
      const relativo = caminho.slice(raiz.length);

      if (permitidos.includes(relativo)) {
        continue;
      }

      const fonte = readFileSync(caminho, "utf8");

      for (const fuso of fusosConhecidos) {
        if (fonte.includes(fuso)) {
          faltas.push(`${relativo} escreve "${fuso}" à mão`);
        }
      }
    }
  }

  assert.deepEqual(faltas, [], faltas.join("\n"));
});
