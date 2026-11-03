/**
 * Os quatro idiomas do painel.
 *
 * O código escreve o texto em português do Brasil dentro de `t("…")`, e os
 * dicionários de `lib/i18n/textos/` dizem como fica em pt-PT, espanhol e
 * inglês. Uma chave sem tradução não rebenta nada: aparece em pt-BR para
 * quem escolheu inglês. É por ser silencioso que precisa de um teste.
 *
 * O que se guarda aqui:
 * 1. Cada `t("…")` literal do código tem tradução nos três dicionários.
 * 2. As variáveis (`{n}`, `{nome}`) são as mesmas na chave e na tradução —
 *    uma tradução que esquece `{n}` mostra "Faltam leads" em vez de
 *    "Faltam 3 leads".
 * 3. A mesma chave não é traduzida de duas formas em duas áreas (a segunda
 *    apagava a primeira sem ninguém ver).
 * 4. A escolha de idioma pelo navegador: pt-PT só para quem pede pt-PT.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { AREAS } from "../lib/i18n/dicionarios.ts";
import { idiomaDoNavegador } from "../lib/i18n/idiomas.ts";
import { criarT } from "../lib/i18n/traduzir.ts";

const raiz = new URL("..", import.meta.url).pathname;
const IDIOMAS_COM_DICIONARIO = ["pt-PT", "es", "en"] as const;

function ficheiros(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) {
      return nome === "node_modules" || nome === "textos" ? [] : ficheiros(caminho);
    }
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}

/** Todas as chaves literais: t("…"), t('…') e t(`…`) sem ${}. */
function chavesDoCodigo() {
  const chaves = new Map<string, string>();
  const padrao = /\bt\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const f of [...ficheiros(join(raiz, "app")), ...ficheiros(join(raiz, "lib"))]) {
    const texto = readFileSync(f, "utf8");
    for (const m of texto.matchAll(padrao)) {
      if (m[1] === "`" && m[2].includes("${")) continue;
      const chave = m[2].replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");
      if (!chaves.has(chave)) chaves.set(chave, f.replace(raiz, ""));
    }
  }
  return chaves;
}

const variaveis = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("cada t(\"…\") do código tem tradução em pt-PT, espanhol e inglês", () => {
  const chaves = chavesDoCodigo();
  assert.ok(chaves.size > 0, "o painel tem de ter textos traduzíveis");
  const faltas: string[] = [];
  for (const idioma of IDIOMAS_COM_DICIONARIO) {
    const dic = Object.assign({}, ...AREAS.map((a) => a[idioma]));
    for (const [chave, ficheiro] of chaves) {
      if (!(chave in dic)) faltas.push(`${idioma}: "${chave}"  (${ficheiro})`);
    }
  }
  assert.deepEqual(faltas.slice(0, 40), [], `faltam ${faltas.length} traduções`);
});

test("as variáveis {…} são as mesmas na chave e na tradução", () => {
  const erradas: string[] = [];
  for (const area of AREAS) {
    for (const idioma of IDIOMAS_COM_DICIONARIO) {
      for (const [chave, traducao] of Object.entries(area[idioma])) {
        if (variaveis(chave).join() !== variaveis(traducao).join()) {
          erradas.push(`${idioma}: "${chave}" → "${traducao}"`);
        }
      }
    }
  }
  assert.deepEqual(erradas, []);
});

test("a mesma chave não tem duas traduções diferentes em áreas diferentes", () => {
  const conflitos: string[] = [];
  for (const idioma of IDIOMAS_COM_DICIONARIO) {
    const visto = new Map<string, string>();
    for (const area of AREAS) {
      for (const [chave, traducao] of Object.entries(area[idioma])) {
        const antes = visto.get(chave);
        if (antes !== undefined && antes !== traducao) {
          conflitos.push(`${idioma}: "${chave}" → "${antes}" e "${traducao}"`);
        }
        visto.set(chave, traducao);
      }
    }
  }
  assert.deepEqual(conflitos, []);
});

test("t() troca as variáveis e cai no texto-fonte quando não há tradução", () => {
  const t = criarT({ "{n} conversas": "{n} conversations" });
  assert.equal(t("{n} conversas", { n: 3 }), "3 conversations");
  assert.equal(t("Sem tradução"), "Sem tradução");
  assert.equal(criarT(null)("{n} conversas", { n: 2 }), "2 conversas");
});

test("o idioma do navegador: pt-PT só para quem pede pt-PT", () => {
  assert.equal(idiomaDoNavegador("pt-PT,pt;q=0.9"), "pt-PT");
  assert.equal(idiomaDoNavegador("pt-BR,pt;q=0.9,en;q=0.8"), "pt-BR");
  assert.equal(idiomaDoNavegador("pt"), "pt-BR");
  assert.equal(idiomaDoNavegador("es-MX,es;q=0.9"), "es");
  assert.equal(idiomaDoNavegador("en-US,en;q=0.9"), "en");
  assert.equal(idiomaDoNavegador("fr-FR,de;q=0.5"), "pt-BR");
  assert.equal(idiomaDoNavegador(null), "pt-BR");
});
