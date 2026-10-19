/**
 * Os campos da ficha de cliente.
 *
 * O campo que estes testes existem para proteger é o canal de aquisição.
 * Medido na base central a 2026-10-16: o Detail tem 1001 contactos e 26 com
 * `origem_tipo` preenchido (2,6%); a Miranda, 573 e 24 (4,2%). Os `origem_*`
 * são capturados do referral que a Meta manda num clique de anúncio para o
 * WhatsApp — o Instagram não manda nada, e quem veio por indicação ou por uma
 * pesquisa no Google nunca deixou rasto nenhum.
 *
 * Por isso há duas colunas e não uma. `origem_tipo` é medido; `origem_manual`
 * é lembrado. O teste que mais importa aqui é o que falha se alguém decidir
 * juntá-las: no dia em que uma escolha à mão puder entrar em `origem_tipo`,
 * deixa de haver forma de saber quais das linhas a Meta confirmou, e o único
 * número que serve para julgar o custo de uma campanha deixa de valer.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";

import {
  canaisDeAquisicao,
  getCanalLabel,
  getOrigemCapturadaLabel,
  isCanalDeAquisicao,
  mostraViatura,
} from "@/lib/clientes/ficha";

import { FakeSupabase, type Linha } from "./helpers/fake-supabase.mjs";

const SLUG = "detail_by_cordeiro";
const CONTACTO = "contacto-1";

function estadoInicial(): Record<string, Linha[]> {
  return {
    lexia_contactos: [
      {
        canal: "whatsapp",
        cliente_slug: SLUG,
        fundido_em: null,
        id: CONTACTO,
        identificador_conversa: "whatsapp:351912345678",
        nome: "Cliente",
        notas: null,
        // Capturado pela Meta. Nenhuma escrita do painel pode mexer nisto.
        origem_tipo: "ctwa",
        telefone: "351912345678",
        telefone_digitos: "351912345678",
      },
    ],
  };
}

let base = new FakeSupabase(estadoInicial());

// A ficha passou a saber de que anúncio veio a pessoa, e essa leitura é
// "server-only". Sem isto o módulo recusa-se a carregar fora do Next.
mock.module("server-only", { namedExports: {} });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/supabase/admin", {
  namedExports: { createAdminClient: () => base },
});

const write = await import("@/lib/clientes/write");

const fichaVazia = {
  emailBruto: "",
  idadeBruto: "",
  moradaBruto: "",
  notasBruto: "",
  origemManualBruto: "",
  origemManualNotaBruto: "",
  viaturaBruto: "",
};

const comum = {
  caminhoParaRevalidar: "/app/clientes",
  clienteSlug: SLUG,
  contactoId: CONTACTO,
  userId: "utilizador-1",
};

function contacto() {
  return base.linhasDe("lexia_contactos").find((linha) => linha.id === CONTACTO);
}

function reiniciar() {
  base = new FakeSupabase(estadoInicial());
}

test("o canal escolhido pelo dono fica gravado, datado e com autor", async () => {
  reiniciar();

  const resultado = await write.gravarFichaDoCliente({
    ...comum,
    campos: { ...fichaVazia, origemManualBruto: "indicacao" },
  });

  assert.equal(resultado.ok, true);
  assert.equal(contacto()?.origem_manual, "indicacao");
  assert.equal(contacto()?.origem_manual_por, "utilizador-1");
  assert.ok(
    contacto()?.origem_manual_em,
    "um canal sem data não se distingue de um escolhido há dois anos",
  );
});

test("gravar a ficha não toca na origem que a Meta confirmou", async () => {
  reiniciar();

  await write.gravarFichaDoCliente({
    ...comum,
    campos: { ...fichaVazia, origemManualBruto: "google" },
  });

  // Se isto falhar, 26 linhas medidas passaram a ser indistinguíveis de
  // centenas de palpites, e o custo por cliente de uma campanha deixa de ter
  // um número de referência.
  assert.equal(
    contacto()?.origem_tipo,
    "ctwa",
    "a escolha do dono escreveu por cima do que a Meta confirmou",
  );
});

test("um canal que não está na lista é recusado", async () => {
  reiniciar();

  const resultado = await write.gravarFichaDoCliente({
    ...comum,
    campos: { ...fichaVazia, origemManualBruto: "tiktok" },
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /canal de aquisição não existe/);
  assert.equal(contacto()?.origem_manual, undefined);
});

test("'Outro' sem explicação não grava", async () => {
  reiniciar();

  const resultado = await write.gravarFichaDoCliente({
    ...comum,
    campos: { ...fichaVazia, origemManualBruto: "outro" },
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.mensagem, /escreve de onde veio/i);
});

test("a explicação só sobrevive quando o canal é 'Outro'", async () => {
  reiniciar();

  await write.gravarFichaDoCliente({
    ...comum,
    campos: {
      ...fichaVazia,
      origemManualBruto: "google",
      origemManualNotaBruto: "sobra de uma escolha trocada",
    },
  });

  // A base tem uma restrição que recusa isto. Apanhá-lo aqui é o que evita um
  // erro de Postgres em bruto no ecrã do dono.
  assert.equal(contacto()?.origem_manual_nota, null);
});

test("a idade fica datada, e um valor impossível é recusado", async () => {
  reiniciar();

  const mau = await write.gravarFichaDoCliente({
    ...comum,
    campos: { ...fichaVazia, idadeBruto: "999" },
  });

  assert.equal(mau.ok, false);
  assert.match(mau.mensagem, /entre 1 e 120/);

  const bom = await write.gravarFichaDoCliente({
    ...comum,
    campos: { ...fichaVazia, idadeBruto: "34" },
  });

  assert.equal(bom.ok, true);
  assert.equal(contacto()?.idade, 34);
  assert.ok(
    contacto()?.idade_registada_em,
    "34 anos sem data deixa de ser verdade no ano seguinte e ninguém percebe",
  );
});

test("os campos da pessoa gravam sem espaços à volta, e vazios ficam nulos", async () => {
  reiniciar();

  const resultado = await write.gravarFichaDoCliente({
    ...comum,
    campos: {
      ...fichaVazia,
      emailBruto: "  martim@exemplo.pt  ",
      moradaBruto: "  Rua das Flores, 12  ",
      viaturaBruto: "  BMW Série 3  ",
    },
  });

  assert.equal(resultado.ok, true);
  assert.equal(contacto()?.email, "martim@exemplo.pt");
  assert.equal(contacto()?.morada, "Rua das Flores, 12");
  assert.equal(contacto()?.viatura, "BMW Série 3");
  assert.equal(contacto()?.idade, null);
});

test("a ficha de um contacto de outra empresa não se grava", async () => {
  reiniciar();

  const resultado = await write.gravarFichaDoCliente({
    ...comum,
    campos: { ...fichaVazia, emailBruto: "intruso@exemplo.pt" },
    clienteSlug: "outra_empresa",
  });

  assert.equal(resultado.ok, false);
  assert.equal(contacto()?.email, undefined);
});

test("o catálogo de canais é o mesmo que a base aceita", () => {
  // A restrição `origem_manual in (…)` é escrita à mão no SQL. Se o catálogo
  // ganhar uma opção e a migration não, a escolha passa na aplicação e rebenta
  // no Postgres — e o dono vê um erro em inglês que não quer dizer nada.
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/202610160006_fase12_ficha_completa.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const canal of canaisDeAquisicao) {
    assert.ok(
      sql.includes(`'${canal.value}'`),
      `o canal "${canal.value}" não está na restrição da migration`,
    );
  }
});

test("o campo do carro só aparece onde se tratam carros", () => {
  assert.equal(mostraViatura("detail_by_cordeiro"), true);
  assert.equal(mostraViatura("miranda_skin_experts"), false);
  assert.equal(mostraViatura("cliente_que_ainda_nao_existe"), false);
});

test("os rótulos sabem ler os dois vocabulários, que são diferentes", () => {
  assert.equal(getCanalLabel("cliente_antigo"), "Cliente antigo");
  assert.equal(getCanalLabel(null), null);

  // Os valores que o Omnichannel grava não são os mesmos que o dono escolhe, e
  // não devem ser: estes quatro foram medidos na base.
  assert.equal(getOrigemCapturadaLabel("ctwa"), "Anúncio para WhatsApp");
  assert.equal(getOrigemCapturadaLabel("instagram_ad"), "Anúncio no Instagram");
  assert.equal(isCanalDeAquisicao("ctwa"), false);
  assert.equal(isCanalDeAquisicao("meta"), true);
});
